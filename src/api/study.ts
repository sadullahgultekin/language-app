import { Hono } from 'hono';
import { Env } from '../types';
import * as db from '../db/queries';

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
  const deck = await db.getStudyDeck(c.env.DB, allWords ? null : listIds);
  // Strip internal sorting fields from response
  const cleaned = deck.map(({ priority, hours_overdue, ...word }: any) => word);
  return c.json(cleaned);
});

app.post('/result', async (c) => {
  const body = await c.req.json<{ word_id: number; correct: boolean }>();
  if (typeof body.word_id !== 'number' || typeof body.correct !== 'boolean') {
    return c.json({ error: 'word_id (number) and correct (boolean) are required' }, 400);
  }
  await db.recordStudyResult(c.env.DB, body.word_id, body.correct);
  return c.json({ ok: true });
});

export default app;
