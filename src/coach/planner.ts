import { z } from 'zod';
import { EXERCISES } from '../core/corpus';
import { MODES, MODE_LABELS, newId, type Evidence, type PlanVersion, type Session, type Settings } from '../core/types';

export const PROMPT_VERSION = 'typign-coach-1';
export const PLAN_SCHEMA_VERSION = 1;
const nonempty = z.string().trim().min(1).max(1200);
const blockSchema = z.object({
  id: z.string().min(1).max(100), mode: z.enum([...MODES, 'evaluation']),
  target: z.string().min(1).max(100), durationSeconds: z.number().int().positive(),
  exerciseIds: z.array(z.string().min(1)).min(1).max(20), guide: z.boolean(),
  evidenceIds: z.array(z.string()).max(30),
}).strict();
export const planContentSchema = z.object({
  goal: z.string().max(1200), focus: z.enum(MODES), totalSeconds: z.number().int().positive(),
  blocks: z.array(blockSchema).min(1).max(8), evidenceIds: z.array(z.string()).max(30),
  explanation: nonempty, nextCheck: nonempty,
}).strict();
const planSchema = planContentSchema.extend({
  id: z.string().min(1).max(100), version: z.number().int().positive(), createdAt: z.iso.datetime(),
  source: z.enum(['standard', 'ai']), model: z.string().min(1).max(100),
  promptVersion: z.string().min(1).max(100), schemaVersion: z.literal(PLAN_SCHEMA_VERSION),
}).strict();

export function unseenEvaluations(sessions: Session[]) {
  const seen = new Set(sessions.flatMap((session) => [...(session.presentedExerciseIds || []),...session.phrases.map((phrase) => phrase.exerciseId)]));
  return EXERCISES.filter((exercise) => exercise.purpose === 'evaluation' && !seen.has(exercise.id));
}

export function validatePlan(plan: unknown, settings: Settings, evidence: Evidence[], sessions: Session[] = []): PlanVersion {
  const value = planSchema.parse(plan);
  if (!Number.isFinite(settings.minutes) || settings.minutes < 1 || settings.minutes > 30) throw new Error('練習時間は一分から三十分で設定してください。');
  if (value.totalSeconds > Math.floor(settings.minutes * 60)
    || value.blocks.reduce((sum, block) => sum + block.durationSeconds, 0) !== value.totalSeconds) {
    throw new Error('セットの合計時間が、設定時間または各ブロックの合計と一致しません。');
  }
  if (!value.blocks.some((block) => block.mode !== 'evaluation')) throw new Error('練習ブロックを含めてください。');
  if (new Set(value.blocks.map((block) => block.id)).size !== value.blocks.length) throw new Error('ブロックIDが重複しています。');
  const evidenceIds = new Set(evidence.map((item) => item.id));
  if (new Set(value.evidenceIds).size !== value.evidenceIds.length
    || value.blocks.some((block) => new Set(block.evidenceIds).size !== block.evidenceIds.length)) throw new Error('根拠IDが重複しています。');
  const allIds = [...value.evidenceIds, ...value.blocks.flatMap((block) => block.evidenceIds)];
  if (allIds.some((id) => !evidenceIds.has(id))) throw new Error('存在しない根拠が含まれています。');
  if (allIds.some((id) => {
    const reference = evidence.find((item) => item.id === id);
    try { return JSON.parse(reference!.conditionsKey).layout !== settings.layout; } catch { return true; }
  })) throw new Error('現在と異なる配列の根拠は、今回のセットに使えません。');
  if (value.blocks.some((block) => block.evidenceIds.some((id) => !value.evidenceIds.includes(id)))) throw new Error('ブロックの根拠がセットの根拠に含まれていません。');
  const unseen = new Set(unseenEvaluations(sessions).map((exercise) => exercise.id));
  for (const block of value.blocks) {
    if (new Set(block.exerciseIds).size !== block.exerciseIds.length) throw new Error('教材IDが重複しています。');
    for (const id of block.exerciseIds) {
      const exercise = EXERCISES.find((item) => item.id === id);
      if (!exercise) throw new Error('存在しない教材が含まれています。');
      if (block.mode === 'evaluation') {
        if (exercise.purpose !== 'evaluation' || !unseen.has(id) || block.guide) throw new Error('確認課題は未見の評価用教材を、ガイドなしで使ってください。');
      } else if (exercise.purpose !== 'practice' || !exercise.modes.includes(block.mode)) {
        throw new Error('教材の用途と練習の種類が一致しません。');
      }
    }
    if (block.mode !== 'evaluation' && block.guide !== settings.guide) throw new Error('練習ガイドの設定が一致しません。');
  }
  if (value.focus !== settings.focus) throw new Error('セットの重点が現在の設定と一致しません。');
  if (!value.blocks.some((block) => block.mode === value.focus)) throw new Error('重点に対応する練習ブロックを含めてください。');
  if (value.goal !== settings.goal) throw new Error('セットの目標が現在の設定と一致しません。');
  if (unseen.size && !value.blocks.some((block) => block.mode === 'evaluation')) throw new Error('練習と分けた未見の確認課題を含めてください。');
  return value;
}

function relevantEvidence(evidence: Evidence[], settings: Settings): Evidence[] {
  return evidence.filter((item) => {
    try {
      const conditions = JSON.parse(item.conditionsKey) as { layout?: string; mode?: string };
      return conditions.layout === settings.layout && ['diagnosis', 'evaluation', settings.focus].includes(conditions.mode ?? '');
    } catch { return false; }
  }).sort((a, b) => Number(a.provisional) - Number(b.provisional)
    || b.errorOpportunities / b.opportunities - a.errorOpportunities / a.opportunities
    || b.opportunities - a.opportunities || a.id.localeCompare(b.id));
}

export function buildStandardPlan(settings: Settings, evidence: Evidence[], sessions: Session[], previous?: PlanVersion, targetOverride?: string): PlanVersion {
  const totalSeconds = Math.floor(settings.minutes * 60);
  const unseen = unseenEvaluations(sessions);
  const candidates = relevantEvidence(evidence, settings);
  if (targetOverride && !EXERCISES.some(exercise=>exercise.purpose==='practice' && exercise.modes.includes(settings.focus) && exercise.patterns.includes(targetOverride))) throw new Error('この対象の教材がありません。');
  const selected = candidates.filter(item=>!targetOverride || item.pattern===targetOverride).find((item) => EXERCISES.some((exercise) => exercise.purpose === 'practice'
    && exercise.modes.includes(settings.focus) && exercise.patterns.includes(item.pattern)));
  const practiced = new Set(sessions.flatMap((session) => session.phrases.filter((p) => p.mode !== 'evaluation').map((p) => p.exerciseId)));
  const exercises = EXERCISES.filter((exercise) => exercise.purpose === 'practice' && exercise.modes.includes(settings.focus));
  const targeted = targetOverride || selected ? exercises.filter((exercise) => exercise.patterns.includes(targetOverride || selected!.pattern)) : [];
  const familiar = exercises.filter((exercise) => practiced.has(exercise.id));
  const fresh = exercises.filter((exercise) => !practiced.has(exercise.id));
  let exerciseIds: string[];
  if (settings.focus === 'weakness' && targeted.length) {
    // A small five-item candidate set makes the initial 60/20/20 policy explicit when the corpus permits it.
    exerciseIds = [...targeted.slice(0, 3), ...familiar.filter((x) => !targeted.includes(x)).slice(0, 1),
      ...exercises.filter((x) => !targeted.includes(x) && !familiar.includes(x)).slice(0, 1)].map((exercise) => exercise.id);
  } else if (settings.focus === 'new-pattern') exerciseIds = [...fresh, ...exercises].map((exercise) => exercise.id);
  else if (settings.focus === 'speed') exerciseIds = [...familiar, ...exercises].map((exercise) => exercise.id);
  else exerciseIds = [...targeted, ...exercises].map((exercise) => exercise.id);
  if(targetOverride && settings.focus!=='weakness') exerciseIds=targeted.map(exercise=>exercise.id);
  exerciseIds = [...new Set(exerciseIds)].slice(0, 5);
  if (!exerciseIds.length) throw new Error('指定した練習の種類に対応する教材がありません。');
  const references = selected ? [selected.id] : [];
  const target = targetOverride ?? selected?.pattern ?? (settings.focus === 'new-pattern' ? '未出題の並びを確かめる' : '基本の入力');
  const checkSeconds = unseen.length ? Math.max(15, Math.floor(totalSeconds / 5)) : 0;
  const plan: PlanVersion = {
    id: previous?.id ?? newId(), version: previous ? previous.version + 1 : 1,
    createdAt: new Date().toISOString(), source: 'standard', goal: settings.goal,
    focus: settings.focus, totalSeconds,
    blocks: [{ id: newId(), mode: settings.focus, target, durationSeconds: totalSeconds - checkSeconds,
      exerciseIds, guide: settings.guide, evidenceIds: references }],
    evidenceIds: references,
    explanation: selected ? `${selected.provisional ? '観測が少ないため仮の候補です。' : '同じ条件で繰り返し観測された候補です。'}${MODE_LABELS[settings.focus]}で${selected.pattern}を確かめます。`
      : targetOverride ? '本人が選んだ対象です。観測した苦手の確定とは区別し、入力の記録を集めます。' : '比較できる観測がまだ十分にありません。基本の教材から始め、入力の記録を集めます。',
    nextCheck: unseen.length ? '練習とは別の未見教材で確認し、後日も同じ条件で確かめます。'
      : '未見の確認教材を使い切っています。新しい評価用教材を追加するまで、未見の確認は行えません。',
    model: 'deterministic', promptVersion: PROMPT_VERSION, schemaVersion: PLAN_SCHEMA_VERSION,
  };
  if (unseen.length) plan.blocks.push({ id: newId(), mode: 'evaluation', target: '未見の確認',
    durationSeconds: checkSeconds, exerciseIds: [unseen[0].id], guide: false, evidenceIds: references });
  return validatePlan(plan, settings, evidence, sessions);
}

export function buildPlanCandidates(settings: Settings, evidence: Evidence[], sessions: Session[], previous?: PlanVersion, requestedTarget?: string) {
  const standardPlan = buildStandardPlan(settings, evidence, sessions, previous);
  if (requestedTarget) {
    const matching = EXERCISES.filter((exercise) => exercise.purpose === 'practice'
      && exercise.modes.includes(settings.focus) && exercise.patterns.includes(requestedTarget));
    if (!matching.length) throw new Error('指定した対象に対応する練習教材がありません。');
    const references = relevantEvidence(evidence, settings).filter((item) => item.pattern === requestedTarget).slice(0, 3).map((item) => item.id);
    const practice = standardPlan.blocks.find((block) => block.mode === settings.focus)!;
    practice.target = requestedTarget; practice.exerciseIds = matching.slice(0, 5).map((item) => item.id);
    for (const block of standardPlan.blocks) block.evidenceIds = [...references];
    standardPlan.evidenceIds = references;
    standardPlan.explanation = '本人が指定した並びを練習します。観測と希望は分けて記録し、別の教材でも確かめます。';
  }
  const standardIds = new Set(standardPlan.blocks.flatMap((block) => block.exerciseIds));
  const unseen = unseenEvaluations(sessions);
  const candidates = [...EXERCISES.filter((exercise) => standardIds.has(exercise.id)),
    ...MODES.flatMap((mode) => EXERCISES.filter((exercise) => exercise.purpose === 'practice' && exercise.modes.includes(mode)).slice(0, 3)),
    ...unseen.slice(0, 3)];
  return { standardPlan,
    exercises: [...new Map(candidates.map((exercise) => [exercise.id, exercise])).values()]
      .map(({ id, modes, purpose, patterns, difficulty }) => ({ id, modes, purpose, patterns, difficulty })),
    unseenEvaluationAvailable: unseen.length > 0 };
}

export function materializeAIPlan(content: unknown, settings: Settings, evidence: Evidence[], sessions: Session[], previous?: PlanVersion): PlanVersion {
  const parsed = planContentSchema.parse(content);
  return validatePlan({ ...parsed, id: previous?.id ?? newId(), version: previous ? previous.version + 1 : 1,
    createdAt: new Date().toISOString(), source: 'ai', model: 'chrome-gemini-nano',
    promptVersion: PROMPT_VERSION, schemaVersion: PLAN_SCHEMA_VERSION }, settings, evidence, sessions);
}
