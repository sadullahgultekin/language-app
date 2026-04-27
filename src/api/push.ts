import { Hono } from 'hono';
import { Env } from '../types';
import { sendPushNotification } from '../lib/webpush';

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

app.post('/test', async (c) => {
  const { results: subs } = await c.env.DB.prepare('SELECT * FROM push_subscriptions').all<{ endpoint: string; p256dh: string; auth: string }>();
  if (subs.length === 0) return c.json({ error: 'No subscriptions found' }, 404);
  const results = [];
  for (const sub of subs) {
    const r = await sendPushNotification(
      sub,
      { title: 'Test notification 🔔', body: 'Push notifications are working!', url: '/' },
      c.env.VAPID_PUBLIC_KEY,
      c.env.VAPID_PRIVATE_KEY,
    );
    results.push({ endpoint: sub.endpoint.slice(0, 50) + '...', status: r.status, ok: r.ok });
  }
  return c.json({ results });
});

export default app;
