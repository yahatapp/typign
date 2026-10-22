'use client';
import { useEffect, useRef, useState } from 'react';
import type { Exercise, InputEventRecord, PlanBlock, Session, Settings, PhraseCapture, RawEvents } from '../core/types';
import { MODE_LABELS, newId } from '../core/types';
import { defaultInput } from '../core/romanization';
import { analyzePhrase, aggregateMetrics } from '../core/measurement';
import { MetricGrid } from './components';

interface Props {
  block: PlanBlock; session: Session; catalog: Exercise[]; settings: Settings;
  active: boolean;
  onSave: (session: Session, raw?: RawEvents) => void;
  onFinish: (session: Session) => void;
}

export function Practice({ block, session: initial, catalog, settings, active, onSave, onFinish }: Props) {
  const exercises = block.exerciseIds.map(id => catalog.find(e => e.id === id)).filter((e): e is Exercise => !!e);
  const session = useRef(initial);
  const [exerciseIndex, setExerciseIndex] = useState(block.mode==='evaluation' || block.mode==='diagnosis' ? 0 : initial.phrases.length);
  const exercise = exercises[exerciseIndex % exercises.length];
  const input = useRef<HTMLTextAreaElement>(null);
  const events = useRef<InputEventRecord[]>([]);
  const origin = useRef(0);
  const firstInput = useRef<number | null>(null);
  const interrupted = useRef(Boolean(initial.presentedExerciseIds?.length));
  const composing = useRef(false);
  const finishing = useRef(false);
  const blockStarted = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const pausedDuration = useRef(0);
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(block.durationSeconds);
  const [guide, setGuide] = useState(block.guide);
  const [last, setLast] = useState(initial.phrases.at(-1));
  const [keyCode, setKeyCode] = useState('');
  const [notice, setNotice] = useState('');
  const [typed, setTyped] = useState('');

  function record(kind: string, extra: Partial<InputEventRecord> = {}) {
    const element = input.current;
    if (!element) return;
    events.current.push({ seq: events.current.length, at: performance.now() - origin.current, kind,
      value: element.value, selectionStart: element.selectionStart, selectionEnd: element.selectionEnd, ...extra });
  }
  function pause(reason = 'pause') {
    if (pausedAt.current !== null || finishing.current) return;
    interrupted.current = true;
    record(reason);
    pausedAt.current = performance.now();
    setPaused(true);
  }
  function resume() {
    if (pausedAt.current !== null) pausedDuration.current += performance.now() - pausedAt.current;
    pausedAt.current = null;
    setPaused(false);
    record('resume');
    requestAnimationFrame(() => input.current?.focus());
  }
  function capture(): PhraseCapture {
    const end = performance.now() - origin.current;
    return { id: newId(), exerciseId: exercise.id, exerciseVersion: exercise.version, mode: block.mode,
      guide, events: [...events.current], value: input.current?.value || '',
      durationMs: firstInput.current === null ? 0 : Math.max(0, end - firstInput.current), interrupted: interrupted.current };
  }
  function confirm(endBlock = false) {
    if (finishing.current || composing.current) return;
    const hasInput = events.current.some(e => e.kind === 'input');
    if (!hasInput && !endBlock) { setNotice('入力してから確定してください。'); return; }
    if (hasInput) {
      record('confirm');
      const captured = capture();
      const result = analyzePhrase(exercise, captured);
      session.current = { ...session.current, phrases: [...session.current.phrases, result] };
      setLast(result);
      onSave(session.current, { id: captured.id, sessionId: session.current.id, createdAt: new Date().toISOString(), capture: captured });
    }
    const limit = block.mode === 'diagnosis' ? 6 : block.mode === 'evaluation' ? Math.min(exercises.length, 3) : Infinity;
    if (endBlock || remaining <= 0 || session.current.phrases.length >= limit) {
      finishing.current = true;
      const finished: Session = { ...session.current, status: 'completed', endedAt: new Date().toISOString() };
      onSave(finished);
      onFinish(finished);
      return;
    }
    events.current = [];
    origin.current = performance.now(); firstInput.current = null; interrupted.current = false;
    if (input.current) input.current.value = '';
    setTyped(''); setNotice(''); setExerciseIndex(i => i + 1);
    requestAnimationFrame(() => input.current?.focus());
  }
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  useEffect(() => { if (!active) pause('navigation'); }, [active]);
  useEffect(()=>{
    if(exercise && !session.current.presentedExerciseIds?.includes(exercise.id)){
      session.current={...session.current,presentedExerciseIds:[...(session.current.presentedExerciseIds||[]),exercise.id]};
      onSave(session.current);
    }
  },[exercise?.id]);

  useEffect(() => {
    origin.current = performance.now(); blockStarted.current = performance.now();
    input.current?.focus();
    if ((block.mode==='evaluation' && initial.phrases.length>=Math.min(exercises.length,3)) || (block.mode==='diagnosis' && initial.phrases.length>=6)) {
      confirmRef.current(true);
    }
    // React's synthetic beforeinput may be backed by textInput; use the native
    // event here to preserve inputType, selection, and editing transaction data.
    const element = input.current;
    const beforeInput = (event: Event) => { const e = event as InputEvent; record('beforeinput', {
      inputType:e.inputType, data:e.data, isComposing:e.isComposing, beforeValue:element?.value,
    }); };
    element?.addEventListener('beforeinput', beforeInput);
    const onVisibility = () => { if (document.hidden) pause('visibility-hidden'); };
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(() => {
      const now = pausedAt.current ?? performance.now();
      const left = Math.min(block.durationSeconds, Math.max(0, block.durationSeconds - (now - blockStarted.current - pausedDuration.current) / 1000));
      setRemaining(Math.ceil(left));
      if (left <= 0 && !composing.current) confirmRef.current(true);
    }, 200);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); element?.removeEventListener('beforeinput', beforeInput); };
  }, []);

  if (!exercise) return <div className="empty">教材がありません。</div>;
  const expected = defaultInput(exercise);
  const progress = Math.min(100, (1 - remaining / block.durationSeconds) * 100);
  return <section className="practice-panel">
    <div className="section-top"><div><span className="eyebrow">{MODE_LABELS[block.mode]}</span><h1>練習</h1></div>
      <div className="timer" aria-label="残り時間">{Math.floor(remaining / 60)}<span>:</span>{String(remaining % 60).padStart(2, '0')}</div></div>
    <div className="progress"><div style={{ width: `${progress}%` }} /></div>
    <div className="practice-meta"><span>対象 <strong>{block.target || '全体'}</strong></span><span>完了 <strong>{session.current.phrases.length}</strong></span>
      <label className="check"><input type="checkbox" checked={guide} onChange={e => { if (events.current.some(ev => ev.kind === 'input')) { setNotice('ガイドは次のフレーズから変更できます。'); return; } setGuide(e.target.checked); }} />入力列</label></div>
    <div className="exercise-card"><span className="eyebrow">{exercise.category === 'mixed' ? '日本語 / 英字・記号' : exercise.category === 'english' ? '英字' : exercise.category === 'symbols' ? '記号' : '日本語 · IME OFF'}</span>
      <h2 className="exercise-text">{exercise.display}</h2>
      <div className="segments">{exercise.segments.map((s, i) => <span key={i} className={s.type === 'literal' ? 'literal' : ''}>{s.text}</span>)}</div>
      {guide && <div className="input-guide" data-testid="input-guide">{expected}</div>}
    </div>
    <label className="input-label" htmlFor="typing-input">入力</label>
    <textarea id="typing-input" ref={input} rows={2} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
      disabled={paused} aria-describedby="input-help" placeholder={paused ? '一時停止中' : 'ここに入力'}
      onFocus={() => record('focus')} onBlur={() => { record('blur'); if (!finishing.current) pause('blur'); }}
      onKeyDown={e => {
        record('keydown', { key: e.key, code: e.code, repeat: e.repeat, isComposing: e.nativeEvent.isComposing,
          shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey });
        setKeyCode(e.code);
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); confirm(); }
      }}
      onKeyUp={e => { record('keyup', { key: e.key, code: e.code }); setKeyCode(''); }}
      onSelect={() => record('selection')}
      onInput={e => { const n = e.nativeEvent as InputEvent; if (firstInput.current === null) firstInput.current = performance.now() - origin.current;
        record('input', { inputType: n.inputType, data: n.data, isComposing: n.isComposing }); setTyped(e.currentTarget.value); }}
      onCompositionStart={() => { composing.current = true; record('compositionstart'); setNotice('IME入力を検出しました。このフレーズは精密な比較から除外します。'); }}
      onCompositionEnd={() => { composing.current = false; record('compositionend'); }}
      onPaste={() => { record('paste'); setNotice('貼り付けを検出しました。このフレーズは速度比較から除外します。'); }}
      onDrop={() => record('drop')}
    />
    <div id="input-help" className="input-help"><span>Enter 確定 · 誤りを残しても確定できます</span><span>{typed.length} 文字</span></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    <div className="practice-actions">{paused ? <button className="primary" onClick={resume}>再開</button> : <button className="primary" onMouseDown={e => e.preventDefault()} onClick={() => confirm()}>確定 <span>↵</span></button>}
      {!paused && <button onMouseDown={e => e.preventDefault()} onClick={() => pause()}>一時停止</button>}
      <button className="quiet" onMouseDown={e => e.preventDefault()} onClick={() => confirm(true)}>ブロックを終了</button></div>
    <Keyboard layout={settings.layout} code={keyCode} />
    {last && <details className="last-result"><summary>直前の結果</summary><MetricGrid metrics={last.metrics} /><p className="muted">{last.metrics.exclusions.join(' / ')}</p></details>}
    <div className="footnote">{MODE_LABELS[block.mode]} · {settings.layout} · ガイド{guide ? 'あり' : 'なし'} · {aggregateMetrics(session.current.phrases).insertedCharacters} 入力文字</div>
  </section>;
}

function Keyboard({ layout, code }: { layout: 'JIS' | 'US'; code: string }) {
  const rows = [
    ['Q','W','E','R','T','Y','U','I','O','P', ...(layout === 'JIS' ? ['@','['] : ['[',']'])],
    ['A','S','D','F','G','H','J','K','L',';', ...(layout === 'JIS' ? [':',']'] : ["'"])],
    ['Z','X','C','V','B','N','M',',','.','/', ...(layout === 'JIS' ? ['\\'] : [])],
  ];
  return <details className="keyboard-guide"><summary>キー配置・ホームポジション <span>{layout}</span></summary>
    <div className="keyboard" aria-label={`${layout} キー配置`}>{rows.map((row, i) => <div className="key-row" key={i}>{row.map(key => <kbd key={key} className={`${code === `Key${key}` ? 'pressed' : ''} ${key === 'F' || key === 'J' ? 'home-key' : ''}`}>{key}</kbd>)}</div>)}</div>
    <p className="muted">F・Jが人差し指の基準位置です。表示は配置の案内で、実際に使った指の判定ではありません。</p></details>;
}
