import { Hono } from 'hono';
import { Env } from '../types';
import * as db from '../db/queries';
import type { Grade } from '../db/sm2';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const listsParam = c.req.query('lists');
  if (!listsParam) {
    return c.json({ error: 'lists query parameter is required' }, 400);
  }
  const allWords = listsParam === 'all';
  const listIds = allWords ? [] : listsParam.split(',').map(Number).filter(n => !isNaN(n));
  if (!allWords && listIds.length === 0) {
    return c.json({ error: 'At least one valid list ID is required' }, 400);
  }
  const practice = c.req.query('practice') === '1';
  const deck = await db.getStudyDeck(c.env.DB, allWords ? null : listIds, practice);
  const cleaned = deck.map(({ priority, ...word }: any) => word);
  return c.json(cleaned);
});

app.post('/result', async (c) => {
  const body = await c.req.json<{ word_id: number; grade: Grade; counts_toward_progress?: boolean }>();
  const validGrades = [1, 2, 3, 4];
  if (typeof body.word_id !== 'number' || !validGrades.includes(body.grade)) {
    return c.json({ error: 'word_id (number) and grade (1|2|3|4) are required' }, 400);
  }
  const counts = body.counts_toward_progress !== false;
  await db.recordStudyResult(c.env.DB, body.word_id, body.grade, counts);
  return c.json({ ok: true });
});

export default app;
