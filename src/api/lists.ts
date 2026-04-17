import { Hono } from 'hono';
import { Env } from '../types';
import * as db from '../db/queries';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const lists = await db.getAllLists(c.env.DB);
  return c.json(lists);
});

app.post('/', async (c) => {
  const body = await c.req.json<{ name: string; description?: string }>();
  if (!body.name?.trim()) {
    return c.json({ error: 'Name is required' }, 400);
  }
  const list = await db.createList(c.env.DB, body.name.trim(), body.description?.trim() ?? '');
  return c.json(list, 201);
});

app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const list = await db.getList(c.env.DB, id);
  if (!list) return c.json({ error: 'List not found' }, 404);
  const words = await db.getWordsForList(c.env.DB, id);
  return c.json({ ...list, words });
});

app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name: string; description?: string }>();
  if (!body.name?.trim()) {
    return c.json({ error: 'Name is required' }, 400);
  }
  const list = await db.updateList(c.env.DB, id, body.name.trim(), body.description?.trim() ?? '');
  if (!list) return c.json({ error: 'List not found' }, 404);
  return c.json(list);
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await db.deleteList(c.env.DB, id);
  return c.json({ ok: true });
});

app.post('/:id/reset-progress', async (c) => {
  const id = Number(c.req.param('id'));
  await db.resetListProgress(c.env.DB, id);
  return c.json({ ok: true });
});

// Word routes nested under lists
app.post('/:id/words', async (c) => {
  const listId = Number(c.req.param('id'));
  const body = await c.req.json<{ word: string; translation: string; description?: string }>();
  if (!body.word?.trim() || !body.translation?.trim()) {
    return c.json({ error: 'Word and translation are required' }, 400);
  }
  const word = await db.createWord(c.env.DB, listId, body.word.trim(), body.translation.trim(), body.description?.trim() ?? '');
  return c.json(word, 201);
});

app.post('/:id/words/bulk', async (c) => {
  const listId = Number(c.req.param('id'));
  const body = await c.req.json<{ words: { word: string; translation: string; description?: string }[] }>();
  if (!Array.isArray(body.words) || body.words.length === 0) {
    return c.json({ error: 'Words array is required' }, 400);
  }
  const cleaned = body.words
    .filter(w => w.word?.trim() && w.translation?.trim())
    .map(w => ({ word: w.word.trim(), translation: w.translation.trim(), description: w.description?.trim() ?? '' }));
  const count = await db.bulkCreateWords(c.env.DB, listId, cleaned);
  return c.json({ added: count }, 201);
});

export default app;
