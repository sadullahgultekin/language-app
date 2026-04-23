import { Hono } from 'hono';
import { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.get('/vapid-public-key', (c) => {
  return c.json({ key: c.env.VAPID_PUBLIC_KEY });
});

app.post('/subscribe', async (c) => {
  const { endpoint, keys } = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>();

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json({ error: 'endpoint, keys.p256dh and keys.auth are required' }, 400);
  }

  await c.env.DB.prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth)
    VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
  `).bind(endpoint, keys.p256dh, keys.auth).run();

  return c.json({ ok: true });
});

app.post('/unsubscribe', async (c) => {
  const { endpoint } = await c.req.json<{ endpoint: string }>();
  if (!endpoint) return c.json({ error: 'endpoint required' }, 400);
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
  return c.json({ ok: true });
});

export default app;
