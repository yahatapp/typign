'use client';
import { useEffect, useRef, useState } from 'react';
import { Coach, runCoachEvaluation, type CoachEvaluationResult } from '../coach';
export function CoachEvaluation(){
  const coach=useRef<Coach|null>(null);
  const controller=useRef<AbortController|null>(null);
  const [status,setStatus]=useState('確認中');
  const [results,setResults]=useState<CoachEvaluationResult[]>([]);
  const [running,setRunning]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{const instance=new Coach();coach.current=instance;instance.availability().then(value=>setStatus(value));return()=>instance.destroy();},[]);
  async function run(){
    setRunning(true);setError('');setResults([]);controller.current=new AbortController();
    try{
      await coach.current!.init(progress=>setStatus(`取得中 ${Math.round(progress*100)}%`));
      setStatus('実モデルで検証中');
      await runCoachEvaluation(coach.current!,{signal:controller.current.signal,onResult:result=>setResults(previous=>[...previous,result])});
      setStatus('検証終了');
    }catch(e){setError(String(e));setStatus('中断または失敗');}finally{setRunning(false);}
  }
  return <section className="page"><span className="eyebrow">DEVELOPMENT ONLY</span><h1>コーチ検証</h1><p>匿名の集計20例を使い、実モデルで日本語の提案・時間と重点の変更・振り返りを確認します。個人の記録は読み込みません。</p><p role="status">状態：{status}</p><button className="primary" disabled={running || status==='unavailable'} onClick={run}>実モデルで20例を検証</button>{running&&<button onClick={()=>{controller.current?.abort();coach.current?.cancel();}}>検証を中断</button>}
    {error&&<p role="alert" className="error">{error}</p>}<p>{results.length} / 20 完了 · {results.filter(r=>r.passed).length} 合格</p>
    <div className="button-row"><button disabled={!results.length} onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({checkedAt:new Date().toISOString(),userAgent:navigator.userAgent,results},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='typign-coach-evaluation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>結果を書き出す</button></div>
    {results.map(r=><details className="record" key={r.fixtureId}><summary>{r.fixtureId} · {r.description} · {r.passed?'構造検査合格':'失敗'} · {Math.round(r.elapsedMs)} ms</summary><p>{r.error||r.explanation}</p><p>{r.reflection?.summary}</p><p>{r.reflection?.nextCheck}</p><p className="muted">{r.humanReview}</p></details>)}
  </section>;
}
