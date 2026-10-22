import { Suspense } from 'react';
import { App } from './ui/App';
import { EXERCISES } from './core/corpus';
import './ui/styles.css';

export async function Root({ path }: { path: string }) {
  const catalog = await Promise.resolve(EXERCISES);
  return <html lang="ja"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f8f8f5" /><title>Typign — トレーニング</title></head>
    <body><Suspense fallback={<p className="loading">読み込み中</p>}><App initialPath={path} catalog={catalog} /></Suspense>
    <noscript>練習と端末内の保存にはJavaScriptが必要です。</noscript></body></html>;
}
