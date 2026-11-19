import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { apiRoutes } from './routes/api.js';

const app = new Hono();

app.use('/api/*', cors());
app.route('/api', apiRoutes);

export default app;
