import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import app from './index.js';

// Sajikan file statis frontend dari folder public/
app.use('/*', serveStatic({ root: './public' }));

const port = Number(process.env.PORT) || 3005;

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`YT Downloader server berjalan di http://localhost:${info.port}`);
  }
);
