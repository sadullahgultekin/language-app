import { Hono } from 'hono';
import { Env } from './types';
import lists from './api/lists';
import words from './api/words';
import study from './api/study';
import push from './api/push';
import { sendPushNotification } from './lib/webpush';

const app = new Hono<{ Bindings: Env }>();

app.route('/api/lists', lists);
app.route('/api/words', words);
app.route('/api/study', study);
app.route('/api/push', push);

async function sendDailyNotifications(env: Env) {
  // Find subscriptions where the user has words due (learning queue or review queue)
  const { results: subs } = await env.DB.prepare(`
    SELECT DISTINCT ps.endpoint, ps.p256dh, ps.auth,
      (SELECT COUNT(*) FROM study_progress sp WHERE sp.due_at <= datetime('now')) as due_count,
      (SELECT COUNT(*) FROM words w LEFT JOIN study_progress sp ON sp.word_id = w.id WHERE sp.id IS NULL) as new_count
    FROM push_subscriptions ps
  `).all<{ endpoint: string; p256dh: string; auth: string; due_count: number; new_count: number }>();

  const toDelete: string[] = [];

  for (const sub of subs) {
    const total = sub.due_count + sub.new_count;
    if (total === 0) continue;

    const body = sub.due_count > 0
      ? `${sub.due_count} word${sub.due_count !== 1 ? 's' : ''} due for review${sub.new_count > 0 ? ` · ${sub.new_count} new` : ''}`
      : `${sub.new_count} new word${sub.new_count !== 1 ? 's' : ''} ready to learn`;

    const result = await sendPushNotification(
      sub,
      { title: 'Time to study! 📚', body, url: '/' },
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );

    // 410 Gone or 404 = subscription is no longer valid, clean it up
    if (result.status === 410 || result.status === 404) {
      toDelete.push(sub.endpoint);
    }
  }

  if (toDelete.length > 0) {
    const placeholders = toDelete.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint IN (${placeholders})`)
      .bind(...toDelete).run();
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await sendDailyNotifications(env);
  },
};
