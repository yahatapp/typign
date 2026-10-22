import { z } from 'zod';
import { EXERCISES } from '../core/corpus';
import { MODES } from '../core/types';
import type { Backup } from '../core/types';

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const id = z.string().min(1).max(200);
const text = z.string().max(20_000);
const integer = z.number().int().nonnegative();
const count = integer.max(Number.MAX_SAFE_INTEGER);
const duration = z.number().finite().nonnegative();
const ratio = z.number().finite().min(0).max(1);
const date = z.iso.datetime({ offset: true });
const mode = z.enum([...MODES, 'diagnosis', 'evaluation']);
const trainingMode = z.enum(MODES);
const status = z.enum(['active', 'completed', 'interrupted']);
const strings = z.array(text).max(100_000);
const ids = z.array(id).max(100_000);
const knownExercises = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]));

export const ExerciseSchema = z.object({
  id, version: integer.min(1), display: text, reading: text,
  segments: z.array(z.object({ type: z.enum(['kana', 'literal']), text }).strict()).min(1),
  category: z.enum(['japanese', 'english', 'symbols', 'mixed', 'drill']),
  purpose: z.enum(['practice', 'evaluation']), difficulty: integer,
  patterns: strings, modes: z.array(trainingMode),
}).strict();

export const InputEventSchema = z.object({
  seq: integer, at: duration, kind: z.string().min(1).max(100),
  value: text.optional(), beforeValue: text.optional(),
  selectionStart: integer.optional(), selectionEnd: integer.optional(),
  inputType: z.string().max(100).optional(), data: text.nullable().optional(),
  key: z.string().max(100).optional(), code: z.string().max(100).optional(),
  repeat: z.boolean().optional(), isComposing: z.boolean().optional(),
  shiftKey: z.boolean().optional(), ctrlKey: z.boolean().optional(),
  altKey: z.boolean().optional(), metaKey: z.boolean().optional(),
}).strict();

export const PhraseCaptureSchema = z.object({
  id, exerciseId: id, exerciseVersion: integer.min(1), mode,
  guide: z.boolean(), events: z.array(InputEventSchema).max(100_000),
  value: text, durationMs: duration, interrupted: z.boolean(),
}).strict().superRefine((capture, ctx) => {
  for (let i = 1; i < capture.events.length; i++) {
    if (capture.events[i].seq <= capture.events[i - 1].seq) {
      ctx.addIssue({ code: 'custom', path: ['events', i, 'seq'], message: 'イベントの連番が逆転・重複しています。' });
    }
    if (capture.events[i].at < capture.events[i - 1].at) {
      ctx.addIssue({ code: 'custom', path: ['events', i, 'at'], message: 'イベントの時刻が逆転しています。' });
    }
  }
});

export const MetricsSchema = z.object({
  finalAccuracy: ratio.nullable(), matchedCharacters: count, remainingErrors: count,
  insertedCharacters: count, correctionOperations: count, deletedCharacters: count,
  correctionsPer100: duration.nullable(), correctCharactersPerMinute: duration.nullable(),
  coverage: ratio, errorCandidates: count, transpositionCandidates: count,
  eligible: z.boolean(), exclusions: strings, accuracyRecordEligible: z.boolean(),
}).strict();

export const PatternObservationSchema = z.object({
  pattern: id, opportunities: count, errorOpportunities: count,
  samplesMs: z.array(duration).max(100_000),
}).strict().refine((p) => p.errorOpportunities <= p.opportunities, { message: '誤り候補数が出題数を超えています。' });

export const PhraseResultSchema = z.object({
  id, exerciseId: id, exerciseVersion: integer.min(1), mode, guide: z.boolean(),
  finalValue: text, acceptedPath: text, durationMs: duration, metrics: MetricsSchema,
  patterns: z.array(PatternObservationSchema).max(100_000), ambiguous: z.boolean(),
}).strict();

export const ConditionsSchema = z.object({
  layout: z.enum(['JIS', 'US']), inputMode: z.literal('romaji'),
  browser: z.string().max(1000), platform: z.string().max(1000),
  analysisVersion: id, romanizationVersion: id,
}).strict();

export const SessionSchema = z.object({
  id, startedAt: date, endedAt: date.nullable(), mode, status,
  conditions: ConditionsSchema, phrases: z.array(PhraseResultSchema).max(100_000),
  presentedExerciseIds:ids.optional(),
  planId: id.optional(), planVersion: integer.min(1).optional(), executionId: id.optional(),
}).strict().superRefine((session, ctx) => {
  if ((session.planId === undefined) !== (session.planVersion === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['planId'], message: '計画IDと版は両方必要です。' });
  }
  if (session.endedAt && Date.parse(session.endedAt) < Date.parse(session.startedAt)) {
    ctx.addIssue({ code: 'custom', path: ['endedAt'], message: '終了時刻が開始時刻より前です。' });
  }
  const phraseIds = new Set<string>();
  if(session.presentedExerciseIds && (new Set(session.presentedExerciseIds).size!==session.presentedExerciseIds.length || session.presentedExerciseIds.some(id=>!knownExercises.has(id)))) ctx.addIssue({code:'custom',path:['presentedExerciseIds'],message:'表示済み教材に未対応または重複したIDがあります。'});
  session.phrases.forEach((phrase, i) => {
    if (phraseIds.has(phrase.id)) ctx.addIssue({ code: 'custom', path: ['phrases', i, 'id'], message: 'フレーズIDが重複しています。' });
    phraseIds.add(phrase.id);
    if (knownExercises.get(phrase.exerciseId)?.version !== phrase.exerciseVersion) ctx.addIssue({ code: 'custom', path: ['phrases', i, 'exerciseId'], message: '未対応の教材または教材版です。' });
    if (phrase.mode !== session.mode) ctx.addIssue({ code: 'custom', path: ['phrases', i, 'mode'], message: 'セッションの練習種別と一致しません。' });
  });
});

export const EvidenceSchema = z.object({
  id, pattern: id, from: date, to: date, conditionsKey: text,
  opportunities: count, errorOpportunities: count, sessionIds: ids,
  provisional: z.boolean(), medianMs: duration.nullable(),
}).strict().refine((e) => e.errorOpportunities <= e.opportunities, { message: '誤り候補数が出題数を超えています。' })
  .refine((e) => Date.parse(e.from) <= Date.parse(e.to), { message: '根拠の集計期間が逆転しています。' });

export const PlanBlockSchema = z.object({
  id, mode, target: text, durationSeconds: integer.min(1).max(1800),
  exerciseIds: ids.min(1), guide: z.boolean(), evidenceIds: ids,
}).strict();

export const PlanVersionSchema = z.object({
  id, version: integer.min(1), createdAt: date, source: z.enum(['standard', 'ai']),
  goal: text, focus: trainingMode, totalSeconds: integer.min(1).max(1800),
  blocks: z.array(PlanBlockSchema).min(1).max(100), evidenceIds: ids,
  explanation: text, nextCheck: text, model: text, promptVersion: id,
  schemaVersion: z.literal(1),
}).strict().superRefine((plan, ctx) => {
  if (plan.blocks.reduce((sum, b) => sum + b.durationSeconds, 0) !== plan.totalSeconds) {
    ctx.addIssue({ code: 'custom', path: ['totalSeconds'], message: '計画の合計時間が一致しません。' });
  }
  if (new Set(plan.blocks.map((b) => b.id)).size !== plan.blocks.length) {
    ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'ブロックIDが重複しています。' });
  }
});

export const ExecutionSchema = z.object({
  id, planId: id, planVersion: integer.min(1), startedAt: date,
  endedAt: date.nullable(), status, sessionIds: ids,
}).strict().refine((execution) => !execution.endedAt || Date.parse(execution.endedAt) >= Date.parse(execution.startedAt), { message: '終了時刻が開始時刻より前です。' });

export const ReflectionSchema = z.object({
  id, executionId: id, createdAt: date, summary: text, nextCheck: text,
  userNote: text, source: z.enum(['standard', 'ai']), evidenceIds: ids,
}).strict();

export const SettingsSchema = z.object({
  id: z.literal('settings'), layout: z.enum(['JIS', 'US']), goal: text,
  minutes: integer.min(1).max(30), focus: trainingMode,
  guide: z.boolean(), coachEnabled: z.boolean(),
}).strict();

export const RawEventsSchema = z.object({
  id, sessionId: id, createdAt: date, capture: PhraseCaptureSchema,
}).strict();

const planKey = (id: string, version: number) => JSON.stringify([id, version]);

/** Structural validation and referential validation run before any database write. */
export const BackupSchema = z.object({
  schemaVersion: z.literal(1), exportedAt: date, settings: SettingsSchema,
  sessions: z.array(SessionSchema).max(100_000), evidence: z.array(EvidenceSchema).max(100_000),
  plans: z.array(PlanVersionSchema).max(100_000), executions: z.array(ExecutionSchema).max(100_000),
  reflections: z.array(ReflectionSchema).max(100_000), rawEvents: z.array(RawEventsSchema).max(100_000),
}).strict().superRefine((backup, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const unique = (items: { id: string; version?: number }[], field: string) => {
    const seen = new Set<string>();
    items.forEach((item, i) => {
      const key = field === 'plans' ? planKey(item.id, item.version!) : item.id;
      if (seen.has(key)) issue([field, i, 'id'], 'IDが重複しています。');
      seen.add(key);
    });
  };
  for (const field of ['sessions', 'evidence', 'plans', 'executions', 'reflections', 'rawEvents'] as const) unique(backup[field], field);
  const sessions = new Map(backup.sessions.map((s) => [s.id, s]));
  const evidence = new Set(backup.evidence.map((e) => e.id));
  const plans = new Set(backup.plans.map((p) => planKey(p.id, p.version)));
  const executions = new Map(backup.executions.map((e) => [e.id, e]));
  const exercises = knownExercises;
  const references = (ids: string[], known: { has(id: string): boolean }, path: (string | number)[]) => {
    ids.forEach((id, i) => { if (!known.has(id)) issue([...path, i], '参照先がありません。'); });
    if (new Set(ids).size !== ids.length) issue(path, '参照IDが重複しています。');
  };
  backup.sessions.forEach((session, i) => {
    if (session.planId && !plans.has(planKey(session.planId, session.planVersion!))) issue(['sessions', i, 'planId'], '計画の参照先がありません。');
    if (session.executionId) {
      const execution = executions.get(session.executionId);
      if (!execution || !execution.sessionIds.includes(session.id)) issue(['sessions', i, 'executionId'], '実施の参照先と一致しません。');
      else if (session.planId !== execution.planId || session.planVersion !== execution.planVersion) issue(['sessions', i, 'planId'], '実施した計画の版と一致しません。');
    }
  });
  backup.evidence.forEach((e, i) => references(e.sessionIds, sessions, ['evidence', i, 'sessionIds']));
  backup.plans.forEach((plan, i) => {
    references(plan.evidenceIds, evidence, ['plans', i, 'evidenceIds']);
    plan.blocks.forEach((block, j) => {
      references(block.exerciseIds, exercises, ['plans', i, 'blocks', j, 'exerciseIds']);
      references(block.evidenceIds, evidence, ['plans', i, 'blocks', j, 'evidenceIds']);
      if (block.evidenceIds.some((id) => !plan.evidenceIds.includes(id))) issue(['plans', i, 'blocks', j, 'evidenceIds'], 'ブロックの根拠が計画の根拠に含まれていません。');
      block.exerciseIds.forEach((id, k) => {
        const exercise = exercises.get(id);
        if (!exercise) return;
        if (block.mode === 'evaluation' || block.mode === 'diagnosis') {
          if (exercise.purpose !== 'evaluation') issue(['plans', i, 'blocks', j, 'exerciseIds', k], '確認・診断には評価用教材を使ってください。');
        } else if (exercise.purpose !== 'practice' || !exercise.modes.includes(block.mode)) {
          issue(['plans', i, 'blocks', j, 'exerciseIds', k], '教材の用途と練習種別が一致しません。');
        }
      });
    });
  });
  backup.executions.forEach((execution, i) => {
    if (!plans.has(planKey(execution.planId, execution.planVersion))) issue(['executions', i, 'planId'], '計画の参照先がありません。');
    references(execution.sessionIds, sessions, ['executions', i, 'sessionIds']);
    execution.sessionIds.forEach((sessionId, j) => {
      if (sessions.get(sessionId)?.executionId !== execution.id) issue(['executions', i, 'sessionIds', j], 'セッションの実施IDと一致しません。');
    });
  });
  backup.reflections.forEach((reflection, i) => {
    if (!executions.has(reflection.executionId)) issue(['reflections', i, 'executionId'], '実施の参照先がありません。');
    references(reflection.evidenceIds, evidence, ['reflections', i, 'evidenceIds']);
  });
  const captureIds = new Set<string>();
  backup.rawEvents.forEach((raw, i) => {
    const session = sessions.get(raw.sessionId);
    const phrase = session?.phrases.find((p) => p.id === raw.capture.id);
    if (!phrase || phrase.exerciseId !== raw.capture.exerciseId || phrase.exerciseVersion !== raw.capture.exerciseVersion || phrase.mode !== raw.capture.mode || phrase.guide !== raw.capture.guide || phrase.finalValue !== raw.capture.value) issue(['rawEvents', i, 'capture'], '保存されたフレーズの参照先と一致しません。');
    const key = JSON.stringify([raw.sessionId, raw.capture.id]);
    if (captureIds.has(key)) issue(['rawEvents', i, 'capture', 'id'], '同じフレーズの生イベントが重複しています。');
    captureIds.add(key);
  });
});

export function validateBackup(value: unknown): Backup {
  return BackupSchema.parse(value);
}
