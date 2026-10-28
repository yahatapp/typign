import { createFromReadableStream, getClientEntryUrl } from '@vitejs/plugin-rsc/ssr';
import { use } from 'react';
import { renderToReadableStream } from 'react-dom/server.edge';
import { injectRSCPayload } from 'rsc-html-stream/server';
import type { RscPayload } from './entry.rsc';

export async function renderHTML(stream: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const [forSsr, forBrowser] = stream.tee();
  let payload: Promise<RscPayload>;
  function SsrRoot() {
    payload ??= createFromReadableStream<RscPayload>(forSsr);
    return use(payload).root;
  }
  const html = await renderToReadableStream(<SsrRoot />, {
    signal,
    bootstrapScriptContent: `import(${JSON.stringify(getClientEntryUrl())})`,
    onError(error) { console.error('HTML streaming failed', error); },
  });
  return { stream: html.pipeThrough(injectRSCPayload(forBrowser)), status: 200 };
}
