import { Hono } from 'hono';
import { apiRoutes } from './routes/api.js';

const app = new Hono();

app.route('/api', apiRoutes);

export default app;
