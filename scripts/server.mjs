import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { fileURLToPath } from 'node:url';
// RSC's runtime entry selects its development/production wire format at import
// time. Set this before loading the built renderer, including on AWS.
process.env.NODE_ENV = 'production';
const renderer = (await import('./rsc/index.js')).default;

const endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT;
const match = endpoint?.match(/^(.*):(\d+)$/);
if (endpoint && !match) throw new Error('Invalid AWS_LAMBDA_HTTP_ENDPOINT');
const hostname = match?.[1] || process.env.HOST || '127.0.0.1';
const port = Number(match?.[2] || process.env.PORT || 3000);
const app = new Hono();
app.use('/assets/*', serveStatic({ root: fileURLToPath(new URL('./client', import.meta.url)), onFound(_path, c) {
  c.header('Cache-Control', 'public,max-age=31536000,immutable');
  c.header('X-Content-Type-Options', 'nosniff');
} }));
app.all('*', (c) => renderer.fetch(c.req.raw));
serve({ fetch: app.fetch, hostname, port }, (info) => console.log(`Typign http://${hostname}:${info.port}`));
