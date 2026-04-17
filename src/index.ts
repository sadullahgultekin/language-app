import { Hono } from 'hono';
import { Env } from './types';
import lists from './api/lists';
import words from './api/words';
import study from './api/study';

const app = new Hono<{ Bindings: Env }>();

app.route('/api/lists', lists);
app.route('/api/words', words);
app.route('/api/study', study);

export default app;
