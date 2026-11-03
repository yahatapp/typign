import { createFromReadableStream } from '@vitejs/plugin-rsc/browser';
import { hydrateRoot } from 'react-dom/client';
import { rscStream } from 'rsc-html-stream/client';
import type { RscPayload } from './entry.rsc';

async function hydrate() {
  const payload = await createFromReadableStream<RscPayload>(rscStream);
  hydrateRoot(document, payload.root);
}
hydrate().catch((error) => {
  console.error('Hydration failed', error);
  const status = document.createElement('p');
  status.textContent = '画面を読み込めませんでした。再読み込みしてください。';
  status.setAttribute('role', 'alert');
  document.body.append(status);
});
if (import.meta.hot) import.meta.hot.on('rsc:update', () => location.reload());
