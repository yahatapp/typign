'use client';
import type { Evidence, Metrics, PlanVersion } from '../core/types';
import { MODE_LABELS } from '../core/types';
export const percent = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(1)}%`;
export const number = (n: number | null) => n === null ? '—' : n.toFixed(1);
export const date = (value: string) => new Date(value).toLocaleString('ja-JP', { month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' });
export function MetricGrid({ metrics: m }: { metrics: Metrics }) {
  return <dl className="metric-grid"><div><dt>最終正確性</dt><dd>{percent(m.finalAccuracy)}</dd><small>残存誤り {m.remainingErrors} 文字</small></div>
    <div><dt>正しい文字 / 分</dt><dd>{number(m.correctCharactersPerMinute)}</dd><small>一致 {m.matchedCharacters} 文字</small></div>
    <div><dt>修正 / 100入力文字</dt><dd>{number(m.correctionsPer100)}</dd><small>{m.correctionOperations} 操作 / {m.insertedCharacters} 入力文字</small></div>
    <div><dt>計測カバー率</dt><dd>{percent(m.coverage)}</dd><small>誤り候補 {m.errorCandidates} 件</small></div></dl>;
}
export function PlanTable({ plan }: { plan: PlanVersion }) {
  return <div className="plan-table" role="table" aria-label="練習セット"><div className="plan-table-head" role="row"><span>種類</span><span>対象</span><span>時間</span></div>
    {plan.blocks.map((block, i) => <div className="plan-row" role="row" key={block.id}><div><span className="row-number">{String(i+1).padStart(2,'0')}</span><strong>{MODE_LABELS[block.mode]}</strong></div><code>{block.target || '全体'}</code><span>{block.durationSeconds < 60 ? `${block.durationSeconds}秒` : `${Math.floor(block.durationSeconds/60)}分${block.durationSeconds%60 ? `${block.durationSeconds%60}秒` : ''}`}</span></div>)}</div>;
}
export function EvidenceList({ evidence, onSelect }: { evidence: Evidence[]; onSelect?: (e: Evidence) => void }) {
  if (!evidence.length) return <div className="empty compact"><span className="empty-mark">∅</span><p>計測データなし</p><small>診断の結果から根拠を表示します。</small></div>;
  return <div className="evidence-list">{evidence.map(e => <button key={e.id} className="evidence-item" onClick={() => onSelect?.(e)}><div><code>{e.pattern}</code><span className="badge">{e.provisional ? '仮候補' : '候補'}</span></div><div className="evidence-value">{e.errorOpportunities}<span> / {e.opportunities} 機会</span></div><small>{e.sessionIds.length} セッション · {percent(e.opportunities ? e.errorOpportunities/e.opportunities : null)}</small></button>)}</div>;
}
