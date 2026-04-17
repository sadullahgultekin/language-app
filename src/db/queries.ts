import { Env, List, ListWithCount, Word, StudyWord } from '../types';

type DB = Env['DB'];

// --- Lists ---

export async function getAllLists(db: DB): Promise<ListWithCount[]> {
  const { results } = await db.prepare(`
    SELECT l.*,
      COUNT(w.id) as word_count,
      COALESCE(AVG(sp.confidence), 0) as avg_confidence
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

export async function getStudyDeck(db: DB, listIds: number[]): Promise<StudyWord[]> {
  const placeholders = listIds.map(() => '?').join(',');
  // Spaced repetition intervals (in hours) per confidence level:
  // 0 = new word, 1 = 4h, 2 = 24h (1 day), 3 = 72h (3 days), 4 = 168h (7 days), 5 = 336h (14 days)
  //
  // Priority order:
  //   1. Never-seen words (no study_progress row or last_studied IS NULL) — priority 0
  //   2. Overdue words (past their review interval) — priority 1, sorted by how overdue they are (most overdue first)
  //   3. Not-yet-due words — priority 2, sorted by confidence ASC
  const { results } = await db.prepare(`
    SELECT w.*,
      COALESCE(sp.confidence, 0) as confidence,
      COALESCE(sp.correct_count, 0) as correct_count,
      COALESCE(sp.incorrect_count, 0) as incorrect_count,
      CASE
        WHEN sp.last_studied IS NULL THEN 0
        WHEN (julianday('now') - julianday(sp.last_studied)) * 24 >=
          CASE COALESCE(sp.confidence, 0)
            WHEN 0 THEN 0
            WHEN 1 THEN 4
            WHEN 2 THEN 24
            WHEN 3 THEN 72
            WHEN 4 THEN 168
            WHEN 5 THEN 336
          END
        THEN 1
        ELSE 2
      END as priority,
      CASE
        WHEN sp.last_studied IS NOT NULL THEN
          (julianday('now') - julianday(sp.last_studied)) * 24 -
          CASE COALESCE(sp.confidence, 0)
            WHEN 0 THEN 0
            WHEN 1 THEN 4
            WHEN 2 THEN 24
            WHEN 3 THEN 72
            WHEN 4 THEN 168
            WHEN 5 THEN 336
          END
        ELSE 999999
      END as hours_overdue
    FROM words w
    LEFT JOIN study_progress sp ON sp.word_id = w.id
    WHERE w.list_id IN (${placeholders})
    ORDER BY priority ASC, hours_overdue DESC, RANDOM()
    LIMIT 30
  `).bind(...listIds).all<StudyWord>();
  return results;
}

export async function resetListProgress(db: DB, listId: number): Promise<void> {
  await db.prepare(`
    DELETE FROM study_progress
    WHERE word_id IN (SELECT id FROM words WHERE list_id = ?)
  `).bind(listId).run();
}

export async function recordStudyResult(db: DB, wordId: number, correct: boolean): Promise<void> {
  if (correct) {
    await db.prepare(`
      INSERT INTO study_progress (word_id, correct_count, confidence, last_studied)
      VALUES (?, 1, 1, datetime('now'))
      ON CONFLICT(word_id) DO UPDATE SET
        correct_count = correct_count + 1,
        confidence = MIN(5, confidence + 1),
        last_studied = datetime('now')
    `).bind(wordId).run();
  } else {
    await db.prepare(`
      INSERT INTO study_progress (word_id, incorrect_count, confidence, last_studied)
      VALUES (?, 1, 0, datetime('now'))
      ON CONFLICT(word_id) DO UPDATE SET
        incorrect_count = incorrect_count + 1,
        confidence = MAX(0, confidence - 1),
        last_studied = datetime('now')
    `).bind(wordId).run();
  }
}
