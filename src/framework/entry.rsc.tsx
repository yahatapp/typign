// Transport adapted from the MIT-licensed @vitejs/plugin-rsc official starter.
import { Hono } from 'hono';
import { renderToReadableStream } from '@vitejs/plugin-rsc/rsc/server';
import { Root } from '../root';
import type { ReactNode } from 'react';

export type RscPayload = { root: ReactNode };
const routes = new Set(['/', '/practice', '/records', '/analysis', '/settings']);
const app = new Hono();
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));
app.get('*', async (c) => {
  const url = new URL(c.req.url);
  const flight = url.pathname === '/_rsc';
  const path = flight ? url.searchParams.get('path') || '/' : url.pathname;
  const status = routes.has(path) || (import.meta.env.DEV && path==='/verify/coach') ? 200 : 404;
  const stream = renderToReadableStream<RscPayload>({ root: <Root path={path} /> }, {
    onError(error: unknown) { console.error('RSC rendering failed', error); },
  });
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (flight) return new Response(stream, { status, headers: { ...headers, 'Content-Type': 'text/x-component;charset=utf-8' } });
  const ssr = await import.meta.viteRsc.loadModule<typeof import('./entry.ssr')>('ssr', 'index');
  const result = await ssr.renderHTML(stream, c.req.raw.signal);
  return new Response(result.stream, { status: status===404 ? 404 : result.status, headers: { ...headers, 'Content-Type': 'text/html;charset=utf-8' } });
});
export default app;
if (import.meta.hot) import.meta.hot.accept();
