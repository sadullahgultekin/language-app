import { Env, List, ListWithCount, Word, StudyWord } from '../types';
import { schedule, Grade, SM2State } from './sm2';

type DB = Env['DB'];

const MAX_NEW_PER_DAY = 20;
const MAX_REVIEWS_PER_DAY = 200;

// --- Lists ---

export async function getAllLists(db: DB): Promise<ListWithCount[]> {
  const { results } = await db.prepare(`
    SELECT l.*,
      COUNT(w.id) as word_count,
      COUNT(CASE WHEN sp.due_at IS NOT NULL AND sp.due_at <= datetime('now') THEN 1 END) as due_count,
      COUNT(CASE WHEN sp.id IS NULL THEN 1 END) as new_count
    FROM lists l
    LEFT JOIN words w ON w.list_id = l.id
    LEFT JOIN study_progress sp ON sp.word_id = w.id
    GROUP BY l.id
    ORDER BY l.updated_at DESC
  `).all<ListWithCount>();
  return results;
}

export async function getList(db: DB, id: number): Promise<List | null> {
  return db.prepare('SELECT * FROM lists WHERE id = ?').bind(id).first<List>();
}

export async function createList(db: DB, name: string, description: string): Promise<List> {
  const { meta } = await db.prepare(
    'INSERT INTO lists (name, description) VALUES (?, ?)'
  ).bind(name, description).run();
  return (await getList(db, meta.last_row_id as number))!;
}

export async function updateList(db: DB, id: number, name: string, description: string): Promise<List | null> {
  await db.prepare(
    "UPDATE lists SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(name, description, id).run();
  return getList(db, id);
}

export async function deleteList(db: DB, id: number): Promise<void> {
  await db.prepare('DELETE FROM lists WHERE id = ?').bind(id).run();
}

// --- Words ---

export async function getWordsForList(db: DB, listId: number): Promise<Word[]> {
  const { results } = await db.prepare(
    'SELECT * FROM words WHERE list_id = ? ORDER BY created_at DESC'
  ).bind(listId).all<Word>();
  return results;
}

export async function createWord(db: DB, listId: number, word: string, translation: string, description: string): Promise<Word> {
  const { meta } = await db.prepare(
    'INSERT INTO words (list_id, word, translation, description) VALUES (?, ?, ?, ?)'
  ).bind(listId, word, translation, description).run();
  return (await db.prepare('SELECT * FROM words WHERE id = ?').bind(meta.last_row_id).first<Word>())!;
}

export async function bulkCreateWords(db: DB, listId: number, words: { word: string; translation: string; description: string }[]): Promise<number> {
  const stmt = db.prepare(
    'INSERT INTO words (list_id, word, translation, description) VALUES (?, ?, ?, ?)'
  );
  const batch = words.map(w => stmt.bind(listId, w.word, w.translation, w.description));
  await db.batch(batch);
  return words.length;
}

export async function updateWord(db: DB, id: number, word: string, translation: string, description: string): Promise<Word | null> {
  await db.prepare(
    'UPDATE words SET word = ?, translation = ?, description = ? WHERE id = ?'
  ).bind(word, translation, description, id).run();
  return db.prepare('SELECT * FROM words WHERE id = ?').bind(id).first<Word>();
}

export async function deleteWord(db: DB, id: number): Promise<void> {
  await db.prepare('DELETE FROM words WHERE id = ?').bind(id).run();
}

// --- Study ---

async function getTodayStats(db: DB): Promise<{ new_introduced: number; reviews_done: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.prepare(
    'SELECT new_introduced, reviews_done FROM daily_stats WHERE date = ?'
  ).bind(today).first<{ new_introduced: number; reviews_done: number }>();
  return row ?? { new_introduced: 0, reviews_done: 0 };
}

export async function getStudyDeck(db: DB, listIds: number[] | null, practice = false): Promise<StudyWord[]> {
  const allWords = listIds === null;
  const placeholders = allWords ? '' : listIds!.map(() => '?').join(',');
  const whereClause = allWords ? '' : `AND w.list_id IN (${placeholders})`;
  const bindings: (number | string)[] = allWords ? [] : listIds!;

  const todayStats = await getTodayStats(db);
  const newBudget = Math.max(0, MAX_NEW_PER_DAY - todayStats.new_introduced);
  const reviewBudget = Math.max(0, MAX_REVIEWS_PER_DAY - todayStats.reviews_done);

  // 1. Learning queue: words in learning phase that are due
  const { results: learningCards } = await db.prepare(`
    SELECT w.*,
      sp.easiness, sp.interval_days, sp.repetitions, sp.learning_step,
      sp.lapses, sp.correct_count, sp.incorrect_count, sp.due_at,
      0 as is_new, 1 as is_learning, 0 as is_review,
      0 as priority
    FROM words w
    JOIN study_progress sp ON sp.word_id = w.id
    WHERE sp.learning_step > 0
      AND sp.due_at <= datetime('now')
      ${whereClause}
    ORDER BY sp.due_at ASC
  `).bind(...bindings).all<StudyWord>();

  // 2. Review queue: graduated cards that are due (respects daily cap)
  const { results: reviewCards } = await db.prepare(`
    SELECT w.*,
      sp.easiness, sp.interval_days, sp.repetitions, sp.learning_step,
      sp.lapses, sp.correct_count, sp.incorrect_count, sp.due_at,
      0 as is_new, 0 as is_learning, 1 as is_review,
      1 as priority
    FROM words w
    JOIN study_progress sp ON sp.word_id = w.id
    WHERE sp.learning_step = 0
      AND sp.due_at <= datetime('now')
      ${whereClause}
    ORDER BY sp.due_at ASC, RANDOM()
    LIMIT ?
  `).bind(...bindings, reviewBudget).all<StudyWord>();

  // 3. New queue: words with no progress row yet (respects daily cap)
  const { results: newCards } = newBudget > 0
    ? await db.prepare(`
        SELECT w.*,
          2.5 as easiness, 0 as interval_days, 0 as repetitions, 1 as learning_step,
          0 as lapses, 0 as correct_count, 0 as incorrect_count, NULL as due_at,
          1 as is_new, 0 as is_learning, 0 as is_review,
          2 as priority
        FROM words w
        LEFT JOIN study_progress sp ON sp.word_id = w.id
        WHERE sp.id IS NULL
          ${whereClause}
        ORDER BY w.created_at ASC
        LIMIT ?
      `).bind(...bindings, newBudget).all<StudyWord>()
    : { results: [] as StudyWord[] };

  const deck = [...learningCards, ...reviewCards, ...newCards];

  // 4. Filler (practice mode only): not-yet-due cards
  if (practice && deck.length === 0) {
    const { results: practiceCards } = await db.prepare(`
      SELECT w.*,
        sp.easiness, sp.interval_days, sp.repetitions, sp.learning_step,
        sp.lapses, sp.correct_count, sp.incorrect_count, sp.due_at,
        0 as is_new, 0 as is_learning, 1 as is_review,
        3 as priority
      FROM words w
      JOIN study_progress sp ON sp.word_id = w.id
      WHERE sp.learning_step = 0
        AND sp.due_at > datetime('now')
        ${whereClause}
      ORDER BY sp.due_at ASC
      LIMIT 30
    `).bind(...bindings).all<StudyWord>();
    return practiceCards;
  }

  return deck.slice(0, 30);
}

export async function resetListProgress(db: DB, listId: number): Promise<void> {
  await db.prepare(`
    DELETE FROM study_progress
    WHERE word_id IN (SELECT id FROM words WHERE list_id = ?)
  `).bind(listId).run();
}

export async function recordStudyResult(db: DB, wordId: number, grade: Grade): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Get or create study_progress row
  const existing = await db.prepare(
    'SELECT * FROM study_progress WHERE word_id = ?'
  ).bind(wordId).first<SM2State & { due_at: string | null }>();

  const isNew = existing === null;

  const currentState: SM2State = existing ?? {
    easiness: 2.5,
    interval_days: 0,
    repetitions: 0,
    learning_step: 1,
    lapses: 0,
  };

  const wasDue = existing === null
    ? true // new words are always "due"
    : existing.due_at !== null && existing.due_at <= new Date().toISOString();

  const result = schedule({ ...currentState, grade, was_due: wasDue });

  const nowIso = new Date().toISOString();
  const dueIso = new Date(Date.now() + result.next_due_minutes * 60 * 1000).toISOString();

  const correctDelta = grade >= 3 ? 1 : 0;
  const incorrectDelta = grade === 1 ? 1 : 0;

  if (isNew) {
    await db.prepare(`
      INSERT INTO study_progress
        (word_id, easiness, interval_days, repetitions, learning_step, lapses,
         correct_count, incorrect_count, due_at, last_studied, introduced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      wordId,
      result.easiness, result.interval_days, result.repetitions,
      result.learning_step, result.lapses,
      correctDelta, incorrectDelta,
      dueIso, nowIso, nowIso
    ).run();

    // Increment new_introduced for today
    await db.prepare(`
      INSERT INTO daily_stats (date, new_introduced, reviews_done) VALUES (?, 1, 0)
      ON CONFLICT(date) DO UPDATE SET new_introduced = new_introduced + 1
    `).bind(today).run();
  } else {
    await db.prepare(`
      UPDATE study_progress SET
        easiness = ?, interval_days = ?, repetitions = ?, learning_step = ?,
        lapses = ?,
        correct_count = correct_count + ?,
        incorrect_count = incorrect_count + ?,
        due_at = ?,
        last_studied = ?
      WHERE word_id = ?
    `).bind(
      result.easiness, result.interval_days, result.repetitions,
      result.learning_step, result.lapses,
      correctDelta, incorrectDelta,
      dueIso, nowIso,
      wordId
    ).run();

    await db.prepare(`
      INSERT INTO daily_stats (date, new_introduced, reviews_done) VALUES (?, 0, 1)
      ON CONFLICT(date) DO UPDATE SET reviews_done = reviews_done + 1
    `).bind(today).run();
  }
}
