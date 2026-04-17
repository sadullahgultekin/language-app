import { Hono } from 'hono';
import { Env } from '../types';
import * as db from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ word: string; translation: string; description?: string }>();
  if (!body.word?.trim() || !body.translation?.trim()) {
    return c.json({ error: 'Word and translation are required' }, 400);
  }
  const word = await db.updateWord(c.env.DB, id, body.word.trim(), body.translation.trim(), body.description?.trim() ?? '');
  if (!word) return c.json({ error: 'Word not found' }, 404);
  return c.json(word);
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await db.deleteWord(c.env.DB, id);
  return c.json({ ok: true });
});

export default app;
