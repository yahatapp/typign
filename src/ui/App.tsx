'use client';
import { Component, startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ANALYSIS_VERSION, DEFAULT_SETTINGS, MODE_LABELS, MODES, ROMANIZATION_VERSION, newId } from '../core/types';
import type { Backup, Evidence, Execution, Exercise, PlanBlock, PlanVersion, RawEvents, Reflection, Session, Settings, TrainingMode } from '../core/types';
import { aggregateMetrics } from '../core/measurement';
import { Coach, buildEvidence, buildStandardPlan,phraseConditionsKey } from '../coach';
import * as repository from '../data/repository';
import { recoverSession } from '../data/recovery';
import { Practice } from './Practice';
import { CoachEvaluation } from './CoachEvaluation';
import { EvidenceList, MetricGrid, PlanTable, date, number, percent } from './components';

const NAV = [{ path: '/', label: 'セット', icon: '▤' }, { path: '/practice', label: '練習', icon: '⌨' }, { path: '/records', label: '記録', icon: '▦' }, { path: '/analysis', label: '分析', icon: '↗' }];
const emptyData = (): Backup => ({ schemaVersion: 1, exportedAt: new Date().toISOString(), settings: { ...DEFAULT_SETTINGS }, sessions: [], evidence: [], plans: [], executions: [], reflections: [], rawEvents: [] });
const coachStatusLabels: Record<string,string> = { unavailable:'未対応', available:'利用可能', downloadable:'取得が必要', downloading:'取得中', initializing:'準備中', ready:'利用可能', generating:'生成中', error:'失敗', cancelled:'キャンセル' };
type Work = { plan?: PlanVersion; execution?: Execution; blocks: PlanBlock[]; index: number; session: Session };

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="error" role="alert">画面の表示に失敗しました。保存済みの記録は設定から復元できます。<button onClick={() => location.reload()}>再読み込み</button></div> : this.props.children; }
}
export function App(props: { initialPath: string; catalog: Exercise[] }) { return <ErrorBoundary><Application {...props} /></ErrorBoundary>; }

function Application({ initialPath, catalog }: { initialPath: string; catalog: Exercise[] }) {
  const [path, setPath] = useState(initialPath);
  const [data, setData] = useState<Backup>(emptyData);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pendingWrites, setPendingWrites] = useState(0);
  const writes = useRef(Promise.resolve());
  const failedWrites = useRef<Array<() => Promise<unknown>>>([]);
  const [coachState, setCoachState] = useState('initializing');
  const [progress, setProgress] = useState(0);
  const [coachError, setCoachError] = useState('');
  const [busy, setBusy] = useState(false);
  const coach = useRef<Coach | null>(null);
  const generation = useRef(0);
  const [message, setMessage] = useState('');
  const [manualTarget,setManualTarget] = useState('');
  const [plan, setPlan] = useState<PlanVersion | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [lastExecution, setLastExecution] = useState<Execution | null>(null);
  const [lastSession, setLastSession] = useState<Session | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [reflectionNote, setReflectionNote] = useState('');
  const [importPreview, setImportPreview] = useState<Backup | null>(null);
  const [dataMessage, setDataMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [analysisMode, setAnalysisMode] = useState('diagnosis');
  const [analysisLayout, setAnalysisLayout] = useState('JIS');
  const settings = data.settings;
  const evidence = useMemo(() => buildEvidence(data.sessions), [data.sessions]);

  function enqueue(operation: () => Promise<unknown>) {
    setPendingWrites(n => n + 1);
    writes.current = writes.current.then(async () => {
      try { await operation(); }
      catch (error) { failedWrites.current.push(operation); setSaveError(error instanceof Error ? error.message : '保存できませんでした'); }
      finally { setPendingWrites(n => n - 1); }
    });
  }
  function navigate(next: string) {
    if (next === path) return;
    history.pushState({}, '', next);
    setPath(next);
  }
  useEffect(() => {
    let mounted = true;
    repository.loadSnapshot().then(snapshot => {
      if (!mounted) return;
      setData(snapshot); setAnalysisLayout(snapshot.settings.layout);
      setPlan(snapshot.plans.filter(p => !snapshot.executions.some(e => e.planId === p.id && e.planVersion === p.version)).at(-1) || null);
    }).catch(error => { if (mounted) setSaveError(`端末内ストレージを利用できません。${String(error)}`); }).finally(() => { if (mounted) setReady(true); });
    const instance = new Coach(); coach.current = instance;
    instance.availability().then(() => { if (mounted) setCoachState(instance.status); }).catch(() => { if (mounted) setCoachState('unavailable'); });
    const pop = () => setPath(location.pathname);
    window.addEventListener('popstate', pop);
    return () => { mounted = false; instance.destroy(); window.removeEventListener('popstate', pop); };
  }, []);
  useEffect(() => {
    if (ready && !plan && !work) {
      try { keepPlan(buildStandardPlan(settings, evidence, data.sessions)); }
      catch (error) { setCoachError(String(error)); }
    }
  }, [ready, plan, work, settings, evidence, data.sessions]);
  useEffect(() => { document.querySelector<HTMLElement>('main h1')?.focus(); }, [path]);

  function changeSettings(patch: Partial<Settings>) {
    if(busy && !('coachEnabled' in patch)) stopCoach();
    const next = { ...settings, ...patch };
    setData(d => ({ ...d, settings: next }));
    enqueue(() => repository.saveSettings(next));
    if (!work && !('coachEnabled' in patch)) keepPlan(buildStandardPlan(next, evidence, data.sessions, plan || undefined,manualTarget || undefined));
  }
  function saveSession(session: Session, raw?: RawEvents) {
    setData(d => {
      const sessions=[...d.sessions.filter(s=>s.id!==session.id),session].sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
      const retained=new Set(sessions.slice(-30).map(s=>s.id));
      const rawEvents=(raw?[...d.rawEvents.filter(e=>e.id!==raw.id),raw]:d.rawEvents).filter(e=>retained.has(e.sessionId)&&Date.parse(e.createdAt)>=Date.now()-30*86400000);
      return {...d,sessions,rawEvents};
    });
    enqueue(() => repository.saveSession(session, raw));
    setWork(w => w?.session.id === session.id ? { ...w, session } : w);
  }
  function saveExecution(execution: Execution) {
    setData(d => ({ ...d, executions: [...d.executions.filter(e => e.id !== execution.id), execution] }));
    enqueue(() => repository.saveExecution(execution));
  }
  function saveRun(session:Session,execution:Execution){
    setData(d=>({...d,sessions:[...d.sessions.filter(s=>s.id!==session.id),session],executions:[...d.executions.filter(e=>e.id!==execution.id),execution]}));
    enqueue(()=>repository.saveRun(session,execution));
  }
  function keepPlan(next: PlanVersion) {
    setPlan(next);
    setData(d => ({ ...d, plans: [...d.plans.filter(p => !(p.id === next.id && p.version === next.version)), next],
      evidence: [...d.evidence.filter(e => !evidence.some(n => n.id === e.id)), ...evidence] }));
    enqueue(async () => { await repository.saveEvidence(evidence); await repository.savePlan(next); });
  }
  function makeSession(block: PlanBlock, activePlan?: PlanVersion, execution?: Execution): Session {
    return { id: newId(), startedAt: new Date().toISOString(), endedAt: null, mode: block.mode, status:'active', phrases: [],
      conditions: { layout: settings.layout, inputMode:'romaji', browser: navigator.userAgent, platform: navigator.platform,
        analysisVersion: ANALYSIS_VERSION, romanizationVersion: ROMANIZATION_VERSION },
      ...(activePlan ? { planId: activePlan.id, planVersion: activePlan.version } : {}), ...(execution ? { executionId: execution.id } : {}) };
  }
  function stopCoach() { generation.current++; coach.current?.cancel(); setBusy(false); setCoachState(busy ? 'cancelled' : coach.current?.status || 'available'); }
  function resumeSession(session:Session) {
    try {
      const recovered=recoverSession(data,catalog,session.id);
      stopCoach(); changeSettings({layout:session.conditions.layout});
      setLastExecution(null);setLastSession(null);setWork(recovered);navigate('/practice');
    } catch(error) { setCoachError(String(error)); }
  }
  function closeInterrupted(session:Session) {
    const endedAt=new Date().toISOString();
    saveSession({...session,status:'interrupted',endedAt});
    const execution=data.executions.find(e=>e.id===session.executionId);
    if(execution) saveExecution({...execution,status:'interrupted',endedAt});
  }
  function startPlan(selected = plan) {
    if (!selected || work) return;
    stopCoach(); setLastSession(null); setLastExecution(null); setReflectionNote('');
    keepPlan(selected);
    const execution: Execution = { id:newId(), planId:selected.id, planVersion:selected.version, startedAt:new Date().toISOString(), endedAt:null, status:'active', sessionIds:[] };
    const session = makeSession(selected.blocks[0], selected, execution);
    execution.sessionIds = [session.id];
    saveRun(session,execution);
    setWork({ plan:selected, execution, blocks:selected.blocks, index:0, session });
    navigate('/practice');
  }
  function startDiagnosis() {
    if (work) return;
    stopCoach(); setLastSession(null); setLastExecution(null);
    const seen = new Set(data.sessions.flatMap(s => [...(s.presentedExerciseIds || []),...s.phrases.map(p => p.exerciseId)]));
    const candidates = catalog.filter(e => e.purpose === 'evaluation' && !seen.has(e.id));
    if (!candidates.length) { setCoachError('未見の診断教材を使い切っています。記録を確認してください。'); return; }
    const categories = ['japanese','english','symbols','mixed'];
    const balanced = [0,1].flatMap(index => categories.flatMap(category => candidates.filter(e => e.category === category).slice(index,index+1)));
    const ids = [...balanced, ...candidates.filter(e => !balanced.includes(e))].slice(0,6).map(e => e.id);
    const block: PlanBlock = { id:newId(), mode:'diagnosis', target:'全体', durationSeconds:120, exerciseIds:ids, guide:settings.guide, evidenceIds:[] };
    const session = makeSession(block); saveSession(session);
    setWork({ blocks:[block], index:0, session }); navigate('/practice');
  }
  function startMode(mode: TrainingMode) {
    const custom = buildStandardPlan({ ...settings, focus:mode }, evidence, data.sessions,undefined,manualTarget || undefined);
    startPlan(custom);
  }
  function finishBlock(session: Session) {
    if (!work) return;
    const updatedExecution = work.execution ? { ...work.execution, sessionIds:[...new Set([...work.execution.sessionIds, session.id])] } : null;
    if (work.index + 1 < work.blocks.length) {
      const index = work.index + 1;
      const nextSession = makeSession(work.blocks[index], work.plan, updatedExecution || undefined);
      if (updatedExecution) updatedExecution.sessionIds.push(nextSession.id);
      if (updatedExecution) saveRun(nextSession,updatedExecution);
      else saveSession(nextSession);
      setWork({ ...work, index, session:nextSession, execution:updatedExecution || undefined });
      return;
    }
    if (updatedExecution) {
      const finished: Execution = { ...updatedExecution, endedAt:new Date().toISOString(), status:'completed' };
      saveExecution(finished); setLastExecution(finished);
      const reflection: Reflection = { id:newId(), executionId:finished.id, createdAt:new Date().toISOString(),
        summary:'実施した練習と確認の結果を記録しました。条件を揃えた次回の確認で変化を確かめます。',
        nextCheck:work.plan?.nextCheck || '翌日以降に、同じ条件の別文で確認します。', userNote:'', source:'standard', evidenceIds:work.plan?.evidenceIds || [] };
      setData(d => ({ ...d, reflections:[...d.reflections, reflection] })); enqueue(() => repository.saveReflection(reflection));
    }
    setLastSession(session); setWork(null); setPlan(null);
  }
  async function enableCoach() {
    setCoachError(''); setCoachState('initializing'); setBusy(true);
    const token = ++generation.current;
    try {
      await coach.current!.init(value => setProgress(value));
      if (token !== generation.current) return;
      setCoachState(coach.current!.status); changeSettings({ coachEnabled:true });
    } catch(error) { if (token === generation.current) { setCoachError(error instanceof Error ? error.message : String(error)); setCoachState(coach.current?.status || 'error'); } }
    finally { if (token === generation.current) setBusy(false); }
  }
  async function propose() {
    if (!coach.current || work) return;
    setBusy(true); setCoachError(''); setCoachState('generating');
    const token = ++generation.current;
    try {
      const next = await coach.current.propose(settings, evidence, data.sessions, plan || undefined, message || undefined, {
        userNotes:data.reflections.map(r => r.userNote), previousReflections:data.reflections.map(r => ({ summary:r.summary,nextCheck:r.nextCheck })),
      });
      if (token !== generation.current) return;
      const nextSettings={...settings,minutes:Math.ceil(next.totalSeconds/60),focus:next.focus};
      setData(d=>({...d,settings:nextSettings}));
      enqueue(()=>repository.saveSettings(nextSettings));
      keepPlan(next); setMessage(''); setCoachState(coach.current.status);
    } catch(error) { if (token === generation.current) { setCoachError(error instanceof Error ? error.message : String(error)); setCoachState(coach.current.status); } }
    finally { if (token === generation.current) setBusy(false); }
  }
  async function reflect() {
    if (!lastExecution || !coach.current) return;
    setBusy(true); setCoachError('');
    const token = ++generation.current;
    try {
      const result = await coach.current.reflect(lastExecution, data.sessions, evidence);
      if (token !== generation.current) return;
      const previous = data.reflections.find(r => r.executionId === lastExecution.id);
      const next: Reflection = { id:previous?.id || newId(), executionId:lastExecution.id, createdAt:new Date().toISOString(),
        ...result, source:'ai', userNote:reflectionNote };
      setData(d => ({ ...d, reflections:[...d.reflections.filter(r => r.executionId !== lastExecution.id), next],
        evidence:[...d.evidence.filter(e => !evidence.some(n => n.id === e.id)), ...evidence] }));
      enqueue(async () => { await repository.saveEvidence(evidence); await repository.saveReflection(next); });
    } catch(error) { if (token === generation.current) setCoachError(error instanceof Error ? error.message : String(error)); }
    finally { if (token === generation.current) setBusy(false); }
  }
  function saveNote() {
    if (!lastExecution) return;
    const previous = data.reflections.find(r => r.executionId === lastExecution.id);
    if (!previous) return;
    const updated = { ...previous, userNote:reflectionNote };
    setData(d => ({ ...d, reflections:d.reflections.map(r => r.id === updated.id ? updated : r) }));
    enqueue(() => repository.saveReflection(updated)); setDataMessage('感想を保存しました。');
  }
  function updateSavedNote(reflection:Reflection,note:string) {
    const updated={...reflection,userNote:note};
    setData(d=>({...d,reflections:d.reflections.map(r=>r.id===updated.id?updated:r)}));
    enqueue(()=>repository.saveReflection(updated));
  }
  async function exportData() {
    try {
      await writes.current;
      if (failedWrites.current.length) throw new Error('未保存の変更があります。先に保存を再試行してください。');
      const text = await repository.exportBackup();
      const url = URL.createObjectURL(new Blob([text], { type:'application/json' }));
      const link = document.createElement('a'); link.href=url; link.download=`typign-${new Date().toISOString().slice(0,10)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setDataMessage('バックアップを書き出しました。');
    } catch(error) { setDataMessage(String(error)); }
  }
  async function importData(file?: File) {
    if (!file) return;
    try { if (file.size > 50*1024*1024) throw new Error('50MiB以下のファイルを選んでください。'); setImportPreview(repository.parseBackup(await file.text())); setDataMessage(''); }
    catch(error) { setDataMessage(`読み込みできません。${String(error)}`); }
  }
  async function restore() {
    if (!importPreview) return;
    try { await writes.current; await repository.restoreBackup(importPreview); setData(importPreview); setImportPreview(null); setPlan(null); setLastSession(null); setLastExecution(null);
      failedWrites.current=[]; setSaveError(''); setDataMessage('データを復元しました。'); }
    catch(error) { setDataMessage(`復元できません。${String(error)}`); }
  }
  async function erase() {
    stopCoach(); coach.current?.destroy();
    try { await writes.current; await repository.deleteAllData(); setData(emptyData()); setPlan(null); setLastSession(null); setLastExecution(null); setSelectedEvidence(null);
      failedWrites.current=[]; setSaveError(''); setDeleting(false); setDataMessage('端末内のデータを削除しました。'); }
    catch(error) { setDataMessage(`削除できません。${String(error)}`); }
  }
  async function retrySave() {
    const retry = [...failedWrites.current]; failedWrites.current=[];
    if (!retry.length) { try { await repository.restoreBackup(data); setSaveError(''); } catch(error) { setSaveError(String(error)); } return; }
    try { for (const operation of retry) await operation(); setSaveError(''); }
    catch(error) { failedWrites.current.push(...retry); setSaveError(String(error)); }
  }
  const reflection = lastExecution && data.reflections.find(r => r.executionId === lastExecution.id);
  const resultSessions = lastExecution ? data.sessions.filter(s => lastExecution.sessionIds.includes(s.id)) : lastSession ? [lastSession] : [];
  const isKnown = [...NAV.map(n => n.path), '/settings', ...(import.meta.env.DEV?['/verify/coach']:[])].includes(path);
  const visibleEvidence = selectedEvidence ? [selectedEvidence] : evidence.slice(0,4);
  const unfinished=!work && data.sessions.filter(s=>s.status==='active').at(-1);

  return <div className="app-shell">
    <aside className="sidebar"><a href="/" className="brand" onClick={e => { e.preventDefault(); navigate('/'); }}>typign<span className="brand-dot">_</span></a><span className="edition">TRAINING NOTE / 01</span>
      <nav aria-label="メインナビゲーション">{NAV.map(item => <a key={item.path} href={item.path} aria-current={path===item.path ? 'page' : undefined} onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(item.path); }}><span className="nav-icon">{item.icon}</span>{item.label}<span className="nav-arrow">↗</span></a>)}</nav>
      <div className="sidebar-bottom"><div className="local-indicator"><span />端末内に保存</div><a href="/settings" aria-current={path==='/settings' ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('/settings'); }}>設定 <span>⚙</span></a><span className="version">MVP 0.1</span></div>
    </aside>
    <div className="workspace"><header className="topbar"><span>{NAV.find(n => n.path===path)?.label || (path==='/settings' ? '設定' : '404')}</span><div><span className="badge">{settings.layout}</span><span className="save-status" role="status">{saveError ? '未保存' : !ready ? '読み込み中' : pendingWrites ? '保存中' : '保存済み'}</span></div></header>
      {saveError && <div className="error storage-error" role="alert">未保存：{saveError}<button onClick={retrySave}>保存を再試行</button><small>この画面では練習を続けられます。保存できるまで、画面を閉じないでください。</small></div>}
      {work && path!=='/practice' && <div className="notice active-notice">練習中 <button onClick={() => navigate('/practice')}>練習へ戻る</button></div>}
      {ready && unfinished && <div className="notice active-notice"><span>中断された練習 · {MODE_LABELS[unfinished.mode]} · {unfinished.phrases.length} 文保存済み</span><div className="button-row"><button onClick={()=>resumeSession(unfinished)}>保存した練習を再開</button><button onClick={()=>closeInterrupted(unfinished)}>中断として記録</button></div></div>}
      <main>
        {ready && work && <section className="page practice-page" hidden={path!=='/practice'}><div className="block-status">ブロック {work.index+1} / {work.blocks.length} <span>{work.plan?.source==='ai' ? 'AI提案' : '標準'}</span></div><Practice key={work.session.id} block={work.blocks[work.index]} session={work.session} catalog={catalog} settings={settings} active={path==='/practice'} onSave={saveSession} onFinish={finishBlock} /></section>}
        {!ready ? <div className="loading">端末内の記録を読み込み中</div> : !isKnown ? <section className="page"><span className="eyebrow">404</span><h1 tabIndex={-1}>ページなし</h1><button onClick={() => navigate('/')}>セットへ</button></section> : path==='/verify/coach' && import.meta.env.DEV ? <CoachEvaluation/> : path==='/' ?
          <div className="set-layout"><section className="set-main"><div className="section-top"><div><span className="eyebrow">TRAINING / SET</span><h1 tabIndex={-1}>セット</h1></div><span className="badge">{plan?.source==='ai' ? 'AI提案' : '標準セット'}{plan ? ` · v${plan.version}` : ''}</span></div>
            <div className="set-controls"><label>時間<select aria-label="時間" value={settings.minutes} disabled={!!work} onChange={e => changeSettings({ minutes:Number(e.target.value) })}>{[...new Set([1,3,5,10,15,settings.minutes])].sort((a,b)=>a-b).map(n => <option key={n} value={n}>{n}分</option>)}</select></label><label>重点<select aria-label="重点" value={settings.focus} disabled={!!work} onChange={e => changeSettings({ focus:e.target.value as TrainingMode })}>{MODES.map(mode => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}</select></label><label>対象<select aria-label="対象" value={manualTarget} disabled={!!work} onChange={e=>{setManualTarget(e.target.value);keepPlan(buildStandardPlan(settings,evidence,data.sessions,plan || undefined,e.target.value || undefined));}}><option value="">自動</option>{[...new Set(catalog.filter(e=>e.purpose==='practice').flatMap(e=>e.patterns))].sort().map(pattern=><option value={pattern} key={pattern}>{pattern}</option>)}</select></label></div>
            {plan && <><PlanTable plan={plan} /><div className="set-summary"><span>{plan.blocks.length} ブロック</span><strong>合計 {plan.totalSeconds/60} 分</strong></div><button className="primary start-button" aria-label="開始" disabled={!!work} onClick={() => startPlan()}>開始 <span aria-hidden="true">↗</span></button><div className="next-check"><span className="eyebrow">確認</span><p>{plan.nextCheck}</p></div></>}
            <div className="section-divider"><h2>診断</h2><span>条件を揃えた観測</span></div><div className="diagnosis-row"><div><p>日本語・英字・記号</p><span className="muted">未見の短文 · 最大2分</span></div><button disabled={!!work} onClick={startDiagnosis}>診断を開始 <span>→</span></button></div>
            <div className="section-divider"><h2>練習</h2><span>種類を選択</span></div><div className="mode-grid">{MODES.map((mode,i) => <button disabled={!!work} onClick={() => startMode(mode)} key={mode}><span className="eyebrow">0{i+1}</span><strong>{MODE_LABELS[mode]}</strong><span>↗</span></button>)}</div>
          </section><aside className="context-panel"><div className="context-title"><h2>根拠</h2><span>{evidence.length} 件</span></div><EvidenceList evidence={visibleEvidence} onSelect={setSelectedEvidence} />
            {selectedEvidence && <EvidenceDetail evidence={selectedEvidence} data={data} onClose={() => setSelectedEvidence(null)} />}
            {plan?.explanation && <p className="coach-explanation">{plan.explanation}</p>}
            <div className="context-title coach-title"><h2>コーチ</h2><span className="badge">{coachStatusLabels[coachState] || coachState}</span></div>
            {!settings.coachEnabled || coachState!=='ready' && !busy ? <div className="coach-setup"><p>Chrome内蔵モデル</p><small>対応端末では、日本語でセットの変更や根拠の相談ができます。初回はモデルを取得します。</small><button onClick={enableCoach} disabled={busy || coachState==='unavailable'}>コーチを有効にする</button></div> : null}
            {busy && <div className="coach-progress" role="status">{coachState==='initializing' || coachState==='downloading' ? `モデル準備 ${Math.round(progress*100)}%` : '生成中'}<button onClick={stopCoach}>キャンセル</button></div>}
            <form className="coach-form" onSubmit={e => { e.preventDefault(); void propose(); }}><label htmlFor="coach-message">相談</label><textarea id="coach-message" rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="時間・重点・対象" disabled={!settings.coachEnabled || !!work} maxLength={1000}/><button onClick={() => {}} disabled={!settings.coachEnabled || busy || !!work || coachState!=='ready'}>セットを提案 <span>↑</span></button></form>
            {coachError && <div className="error" role="alert">{coachError}<button onClick={() => { setPlan(buildStandardPlan(settings,evidence,data.sessions,plan || undefined)); setCoachError(''); }}>標準セット</button></div>}
            <div className="data-boundary">入力・集計・コーチの処理は端末内で行います。</div>
          </aside></div> : path==='/practice' ? <section className="page practice-page">
            {work ? null : lastSession ? <><div className="section-top"><div><span className="eyebrow">RESULT</span><h1 tabIndex={-1}>結果</h1></div><span className="badge">記録済み</span></div>
              {resultSessions.map(s => <section key={s.id} className="result-section"><h2>{MODE_LABELS[s.mode]}</h2><ModeSummary session={s} sessions={data.sessions}/><MetricGrid metrics={aggregateMetrics(s.phrases)} /><details><summary>指標と計測範囲</summary><MetricNotes /><p>{[...new Set(s.phrases.flatMap(p => p.metrics.exclusions))].join(' / ')}</p></details></section>)}
              <section className="reflection"><h2>振り返り</h2>{reflection ? <><span className="badge">{reflection.source==='ai' ? 'AI' : '標準'}</span><p>{reflection.summary}</p><h3>次回の確認</h3><p>{reflection.nextCheck}</p><label htmlFor="reflection-note">感想</label><textarea id="reflection-note" value={reflectionNote} onChange={e => setReflectionNote(e.target.value)} maxLength={1000} /><div className="button-row"><button onClick={saveNote}>感想を保存</button>{settings.coachEnabled && <button disabled={busy} onClick={reflect}>コーチと振り返る</button>}</div></> : <p>診断の結果を記録しました。根拠を確認してセットを選択できます。</p>}
                {coachError && <p className="error" role="alert">{coachError}</p>}{dataMessage && <p role="status">{dataMessage}</p>}</section><button className="primary" onClick={() => { setLastSession(null); navigate('/'); }}>セットへ <span>→</span></button></> : <><span className="eyebrow">PRACTICE</span><h1 tabIndex={-1}>練習</h1><div className="mode-grid">{MODES.map(mode => <button key={mode} onClick={() => startMode(mode)}><strong>{MODE_LABELS[mode]}</strong><span>↗</span></button>)}</div><button onClick={startDiagnosis}>診断を開始</button></>}
          </section> : path==='/records' ? <section className="page"><div className="section-top"><div><span className="eyebrow">TRAINING / LOG</span><h1 tabIndex={-1}>記録</h1></div><span>{data.sessions.length} セッション</span></div>
            {!data.sessions.length ? <div className="empty"><span className="empty-mark">▦</span><h2>記録なし</h2><p>練習の計画、実施内容、結果をここに保存します。</p><button onClick={() => navigate('/')}>セットへ</button></div> : <div className="record-list">{[...data.sessions].reverse().map(s => <details className="record" key={s.id}><summary><div><span className="eyebrow">{date(s.startedAt)}</span><strong>{MODE_LABELS[s.mode]}</strong></div><span>{s.phrases.length} 文 · {s.conditions.layout}</span><span className="badge">{s.status==='completed' ? '完了' : '中断'}</span></summary><MetricGrid metrics={aggregateMetrics(s.phrases)} />
              <p className="muted">入力方式 {s.conditions.inputMode} · 分析 {s.conditions.analysisVersion} · 表記 {s.conditions.romanizationVersion}</p>
              {s.planId && <PlanRecord session={s} data={data} onUpdateNote={updateSavedNote} />}
              <div className="phrase-list">{s.phrases.map(p => <div key={p.id}><p>{catalog.find(e => e.id===p.exerciseId)?.display || p.exerciseId}</p><code>{p.finalValue}</code><small>最終正確性 {percent(p.metrics.finalAccuracy)} · ガイド{p.guide ? 'あり':'なし'} · {p.metrics.exclusions.join(' / ') || '通常入力'}</small><RawDetail raw={data.rawEvents.find(r=>r.capture.id===p.id && Date.parse(r.createdAt)>=Date.now()-30*86400000)}/></div>)}</div></details>)}</div>}
          </section> : path==='/analysis' ? <section className="page"><div className="section-top"><div><span className="eyebrow">TRAINING / ANALYSIS</span><h1 tabIndex={-1}>分析</h1></div></div><div className="set-controls"><label>条件<select value={analysisMode} onChange={e => startTransition(()=>setAnalysisMode(e.target.value))}>{['diagnosis','evaluation',...MODES].map(m => <option key={m} value={m}>{MODE_LABELS[m as keyof typeof MODE_LABELS]}</option>)}</select></label><label>配列<select value={analysisLayout} onChange={e => startTransition(()=>setAnalysisLayout(e.target.value))}><option>JIS</option><option>US</option></select></label></div>
            <AnalysisTrend sessions={data.sessions.filter(s => s.mode===analysisMode && s.conditions.layout===analysisLayout)} />
            <div className="section-divider"><h2>対象ごとの根拠</h2><span>件数・比較条件</span></div><EvidenceList evidence={evidence.filter(e => e.sessionIds.some(id => data.sessions.some(s => s.id===id && s.mode===analysisMode && s.conditions.layout===analysisLayout)))} onSelect={setSelectedEvidence} />
            {selectedEvidence && <EvidenceDetail evidence={selectedEvidence} data={data} onClose={() => setSelectedEvidence(null)} />}
            <details className="metric-notes"><summary>指標の定義</summary><MetricNotes /></details></section> : <section className="page settings-page"><span className="eyebrow">PREFERENCES / DATA</span><h1 tabIndex={-1}>設定</h1>
              <section><h2>入力</h2><div className="settings-fields"><label>配列<select value={settings.layout} disabled={!!work} onChange={e => changeSettings({ layout:e.target.value as 'JIS'|'US' })}><option>JIS</option><option>US</option></select></label><label className="check"><input type="checkbox" checked={settings.guide} onChange={e => changeSettings({ guide:e.target.checked })}/>入力列ガイド</label></div><p className="muted">PC Chrome · 日本語はIME OFFでローマ字入力。かな直接入力・モバイル・IME変換能力の評価は対象外です。</p></section>
              <section><h2>コーチの記憶</h2><label>目標<input value={settings.goal} onChange={e => changeSettings({ goal:e.target.value })} maxLength={200} /></label><button className="quiet" onClick={() => changeSettings({ goal:'' })}>目標を削除</button><p className="muted">目標、時間、重点、保存した感想を次の提案に使います。本人の希望は、入力から観測した事実と区別します。</p><label className="check"><input type="checkbox" checked={settings.coachEnabled} onChange={e => { if (e.target.checked) void enableCoach(); else { stopCoach(); coach.current?.destroy(); changeSettings({ coachEnabled:false }); } }}/>コーチを利用</label></section>
              <section><h2>データ</h2><dl className="data-counts"><div><dt>セッション</dt><dd>{data.sessions.length}</dd></div><div><dt>計画の版</dt><dd>{data.plans.length}</dd></div><div><dt>振り返り</dt><dd>{data.reflections.length}</dd></div></dl><p>保存先：このブラウザのIndexedDB</p><p className="muted">ブラウザのデータ消去、容量不足、プライベートモードなどにより記録を失うことがあります。バックアップは手元のファイルとして保管してください。生イベントは30セッションまたは30日の短い方まで保持します。</p>
                <div className="button-row"><button disabled={!!work} onClick={exportData}>JSONを書き出す ↓</button><label className={`file-button ${work ? 'disabled' : ''}`}>JSONを読み込む ↑<input type="file" accept="application/json,.json" disabled={!!work} onChange={e => { void importData(e.target.files?.[0]); e.target.value=''; }}/></label></div>
                {importPreview && <div className="import-preview"><h3>復元内容</h3><p>{importPreview.sessions.length} セッション、{importPreview.plans.length} 計画、{importPreview.reflections.length} 振り返り</p><p>現在のデータ全体を、この内容に置き換えます。</p><button className="primary" onClick={restore}>置き換えて復元</button><button onClick={() => setImportPreview(null)}>キャンセル</button></div>}
                {dataMessage && <p className="notice" role="status">{dataMessage}</p>}
                <div className="delete-section">{deleting ? <><p>このブラウザの設定、入力記録、計画、感想をすべて削除します。</p><button onClick={erase}>全データを削除する</button><button onClick={() => setDeleting(false)}>キャンセル</button></> : <button className="quiet" disabled={!!work} onClick={() => setDeleting(true)}>全データを削除</button>}</div></section>
              <section><h2>利用と計測</h2><p className="muted">打鍵・文章・個人の集計は運営者へ送信しません。Chromeモデルの初回取得にはネットワークを使います。配信ホストのアクセスログとは別の扱いです。学習効果、実際の指使い、疲労などの原因は推定しません。</p><MetricNotes /><p className="muted">OS・配列ごとの実機確認とAWS上の動作はREADMEの検証状況を参照してください。</p></section>
            </section>}
      </main><footer className="workspace-footer"><span>TYPIGN / PERSONAL TRAINING</span><span>LOCAL FIRST</span></footer>
    </div>
  </div>;
}

function EvidenceDetail({ evidence:e, data, onClose }: { evidence:Evidence; data:Backup; onClose:()=>void }) {
  return <div className="evidence-detail"><div className="section-top"><h3>根拠 <code>{e.pattern}</code></h3><button className="quiet" onClick={onClose}>閉じる</button></div><dl><dt>対象期間</dt><dd>{date(e.from)} — {date(e.to)}</dd><dt>誤り候補 / 出題機会</dt><dd>{e.errorOpportunities} / {e.opportunities}</dd><dt>状態</dt><dd>{e.provisional ? 'サンプル不足・仮候補' : '複数セッションの観測候補'}</dd><dt>適格な所要時間の中央値</dt><dd>{number(e.medianMs)} ms</dd><dt>比較条件</dt><dd className="break">{e.conditionsKey}</dd></dl><small className="break">根拠ID {e.id}</small><p className="muted">{e.sessionIds.filter(id => data.rawEvents.some(r => r.sessionId===id)).length} / {e.sessionIds.length} セッションの詳細イベントを保持しています。</p></div>;
}
function PlanRecord({ session, data, onUpdateNote }: { session:Session; data:Backup; onUpdateNote:(reflection:Reflection,note:string)=>void }) {
  const plan = data.plans.find(p => p.id===session.planId && p.version===session.planVersion);
  const reflection = data.reflections.find(r => r.executionId===session.executionId);
  return <div className="plan-record">{plan && <><h3>選択した計画 · v{plan.version}</h3><p>{plan.goal}</p><PlanTable plan={plan} /><p>{plan.explanation}</p><div className="muted">根拠 {plan.evidenceIds.map(id => data.evidence.find(e => e.id===id)?.pattern || id).join(' / ') || 'データ不足・標準構成'}</div></>}{reflection && <><h3>振り返り</h3><p>{reflection.summary}</p><p>次回：{reflection.nextCheck}</p><SavedNote key={reflection.id} reflection={reflection} onSave={onUpdateNote}/></>}</div>;
}
function SavedNote({reflection,onSave}:{reflection:Reflection;onSave:(reflection:Reflection,note:string)=>void}){
  const [note,setNote]=useState(reflection.userNote);
  return <details><summary>感想の確認・編集</summary><label>保存した感想<textarea value={note} maxLength={1000} onChange={e=>setNote(e.target.value)}/></label><div className="button-row"><button onClick={()=>onSave(reflection,note)}>感想を更新</button><button onClick={()=>{setNote('');onSave(reflection,'');}}>感想を削除</button></div></details>;
}
function RawDetail({raw}:{raw?:RawEvents}){
  const [open,setOpen]=useState(false);
  if(!raw) return <small>詳細イベントは保持期間外です。</small>;
  const edits=raw.capture.events.filter(e=>e.kind==='input');
  return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>編集履歴 · {edits.length} 件</summary>{open&&<><div className="table-scroll"><table><thead><tr><th>相対時刻 ms</th><th>編集</th><th>入力後の文字列</th></tr></thead><tbody>{edits.slice(0,200).map(e=><tr key={e.seq}><td>{Math.round(e.at)}</td><td>{e.inputType || '観測不足'}</td><td><code>{e.value || '∅'}</code></td></tr>)}</tbody></table></div>{edits.length>200&&<p className="muted">画面には最初の200件を表示しています。バックアップには保存中の全イベントを含みます。</p>}</>}</details>;
}
function ModeSummary({session,sessions}:{session:Session;sessions:Session[]}){
  if(session.mode==='speed' || session.mode==='accuracy'){
    const eligible=session.phrases.filter(p=>session.mode==='accuracy'?p.metrics.accuracyRecordEligible:p.metrics.eligible);
    const best=eligible.sort((a,b)=>(b.metrics.correctCharactersPerMinute||0)-(a.metrics.correctCharactersPerMinute||0))[0];
    if(!best) return <p className="notice">{session.mode==='accuracy'?'条件を満たした速度記録は保留です。修正なし・最終正解・カバー率100%の試行を確認します。':'速度比較に使える試行がありません。計測範囲を確認してください。'}</p>;
    const comparable=sessions.filter(s=>s.mode===session.mode && JSON.stringify(s.conditions)===JSON.stringify(session.conditions)).flatMap(s=>s.phrases).filter(p=>p.exerciseId===best.exerciseId && p.exerciseVersion===best.exerciseVersion && p.acceptedPath===best.acceptedPath && p.guide===best.guide && (session.mode==='accuracy'?p.metrics.accuracyRecordEligible:p.metrics.eligible));
    const record=Math.max(...comparable.map(p=>p.metrics.correctCharactersPerMinute||0));
    return <p className="notice">今回の最高 {number(best.metrics.correctCharactersPerMinute)} 正しい文字/分 · 同じ教材・表記・条件の自己記録 {number(record)}{session.mode==='accuracy'?` · 条件適合 ${eligible.length}/${session.phrases.length} 試行`:''}</p>;
  }
  if(session.mode==='new-pattern')return <p className="notice">ガイドあり {session.phrases.filter(p=>p.guide).length} 文 · ガイドなし {session.phrases.filter(p=>!p.guide).length} 文。自力での入力結果と、翌日以降の確認を分けて記録します。</p>;
  if(session.mode==='weakness')return <p className="notice">対象の反復結果です。普段の弱点の判断には、診断と未見の確認を併用します。</p>;
  return null;
}
function AnalysisTrend({ sessions }: { sessions:Session[] }) {
  const groups = new Map<string,Session[]>();
  for (const session of sessions) {
    const key=session.phrases.map(p=>phraseConditionsKey(session,p)).sort().join(' / ');
    groups.set(key, [...(groups.get(key) || []), session]);
  }
  if (!sessions.length) return <div className="empty"><span className="empty-mark">↗</span><p>比較できる記録なし</p></div>;
  return <div className="trend-groups">{[...groups].map(([key, records]) => <section key={key} className="trend-group"><details><summary>比較条件</summary><p className="muted break">{key}</p></details><div className="table-scroll"><table><thead><tr><th>日時</th><th>最終正確性</th><th>正しい文字/分</th><th>修正/100文字</th><th>カバー率</th></tr></thead><tbody>{records.map(s => { const m=aggregateMetrics(s.phrases); return <tr key={s.id}><td>{date(s.startedAt)}</td><td>{percent(m.finalAccuracy)}</td><td>{number(m.correctCharactersPerMinute)}</td><td>{number(m.correctionsPer100)}</td><td>{percent(m.coverage)}</td></tr>; })}</tbody></table></div></section>)}</div>;
}
function MetricNotes() { return <dl className="definitions"><dt>最終正確性</dt><dd>許容する表記経路との編集距離を、経路と入力の長い方の文字数で割り、1から引きます。修正前の誤りは別に残します。</dd><dt>正しい文字 / 分</dt><dd>最終整列で一致した文字数 ÷ 最初の入力から確定までの時間。修正時間を含み、中断や非通常入力は比較から除外します。</dd><dt>修正 / 100入力文字</dt><dd>100 × 削除・置換操作数 ÷ 挿入文字総数。後で削除した入力文字も分母に含みます。</dd><dt>計測カバー率・誤り候補</dt><dd>判定できた入力の範囲と候補件数を表示します。曖昧な編集や表記変更は誤りと断定しません。正確性の速度記録はカバー率100%・修正なし・最終正解の試行に限定します。</dd></dl>; }
