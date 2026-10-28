import { EXERCISES } from '../core/corpus';
import { DEFAULT_SETTINGS, MODES, type Evidence, type Session, type Settings } from '../core/types';
import { buildEvidence } from './evidence';
import { Coach, type CoachReflection } from './chrome';

export interface CoachFixture {
  id: string; description: string; settings: Settings; sessions: Session[]; evidence: Evidence[];
}
const descriptions = [
  '初回で履歴なし', '観測機会が少ない', '誤り候補が少ない', '一回だけの再現',
  '複数回に再現した候補', '誤り候補なし', 'US配列', '異なる配列を混ぜない',
  'ガイドなし', '異なるガイドを混ぜない', 'スピードの観測を分ける', '新パターンの観測を分ける',
  '中断したセッション', '精密計測の対象外', '曖昧な入力', '過去の分析版を分ける',
  '後日の確認待ち', '修正した誤り候補', '長い練習時間', '短い練習時間',
];

/** Synthetic aggregates only. These are evaluation inputs, never learning-effect evidence. */
export function createCoachFixtures(): CoachFixture[] {
  const exercise = EXERCISES.find((item) => item.purpose === 'practice' && item.patterns.length);
  if (!exercise) throw new Error('検証用の教材がありません。');
  return descriptions.map((description, index) => {
    const settings: Settings = { ...DEFAULT_SETTINGS, focus: MODES[index % MODES.length],
      minutes: index === 18 ? 15 : index === 19 ? 1 : 5, layout: index === 6 ? 'US' : 'JIS', guide: index !== 8 };
    const count = index === 0 ? 0 : index === 3 ? 1 : 3;
    const sessions: Session[] = Array.from({ length: count }, (_, offset) => {
      const opportunities = index === 1 ? 4 : 20;
      const errors = index === 5 ? 0 : index === 2 ? offset === 0 ? 1 : 0 : 4;
      return {
        id: `fixture-${index + 1}-session-${offset + 1}`, startedAt: `2026-10-${String(15 + offset).padStart(2, '0')}T10:00:00.000Z`,
        endedAt: `2026-10-${String(15 + offset).padStart(2, '0')}T10:05:00.000Z`,
        mode: index === 10 ? 'speed' : index === 11 || index === 16 ? 'new-pattern' : 'diagnosis',
        status: index === 12 ? 'interrupted' : 'completed',
        conditions: { layout: index === 7 && offset === 0 ? 'US' : settings.layout,
          inputMode: 'romaji', browser: 'Chrome evaluation', platform: 'synthetic desktop',
          analysisVersion: index === 15 && offset === 0 ? '0.9.0' : '1.0.0', romanizationVersion: '1.0.0' },
        phrases: [{ id: `fixture-${index + 1}-phrase-${offset + 1}`, exerciseId: exercise.id,
          exerciseVersion: exercise.version, mode: index === 10 ? 'speed' : index === 11 || index === 16 ? 'new-pattern' : 'diagnosis',
          guide: index === 9 ? offset === 0 : settings.guide, finalValue: '', acceptedPath: 'synthetic', durationMs: 10000,
          ambiguous: index === 14,
          metrics: { finalAccuracy: 1, matchedCharacters: 20, remainingErrors: 0, insertedCharacters: index === 17 ? 24 : 20,
            correctionOperations: index === 17 ? 2 : 0, deletedCharacters: index === 17 ? 4 : 0,
            correctionsPer100: index === 17 ? 100 * 2 / 24 : 0, correctCharactersPerMinute: 120,
            coverage: index === 13 ? 0.5 : 1, errorCandidates: errors, transpositionCandidates: 0,
            eligible: index !== 13, exclusions: index === 13 ? ['synthetic-exclusion'] : [], accuracyRecordEligible: index !== 17 },
          patterns: [{ pattern: exercise.patterns[0], opportunities, errorOpportunities: errors, samplesMs: errors ? [] : [120, 140] }],
        }],
      };
    });
    return { id: `coach-${String(index + 1).padStart(2, '0')}`, description, settings, sessions, evidence: buildEvidence(sessions) };
  });
}

export interface CoachEvaluationResult {
  fixtureId: string; description: string; passed: boolean; elapsedMs: number; error?: string;
  explanation?: string; reflection?: CoachReflection;
  humanReview: '日本語の自然さ・根拠との一致・変更意図・効果や原因の断定がないことを人が確認してください';
}

/** Run manually on a supported Chrome AFTER await coach.init() from a user gesture. No remote service is used. */
export async function runCoachEvaluation(coach: Coach, options: {
  fixtureIds?: string[]; onResult?: (result: CoachEvaluationResult) => void; signal?: AbortSignal;
} = {}): Promise<CoachEvaluationResult[]> {
  const fixtures = createCoachFixtures().filter((fixture) => !options.fixtureIds || options.fixtureIds.includes(fixture.id));
  const results: CoachEvaluationResult[] = [];
  const abort = () => coach.cancel();
  options.signal?.addEventListener('abort', abort);
  try {
    for (const fixture of fixtures) {
      options.signal?.throwIfAborted();
      const started = performance.now();
      const result: CoachEvaluationResult = { fixtureId: fixture.id, description: fixture.description, passed: false, elapsedMs: 0,
        humanReview: '日本語の自然さ・根拠との一致・変更意図・効果や原因の断定がないことを人が確認してください' };
      try {
        const plan = await coach.propose(fixture.settings, fixture.evidence, fixture.sessions);
        const revised = await coach.propose(fixture.settings, fixture.evidence, fixture.sessions, plan,
          '今日は三分で、正確性を重視したいです。現在の設定に合わせて変更してください。');
        if (revised.id !== plan.id || revised.version !== plan.version + 1) throw new Error('変更版の参照が不正です。');
        if (revised.totalSeconds > 180 || revised.focus !== 'accuracy') throw new Error('会話で指定した時間と重点が反映されていません。');
        const reflection = await coach.reflect({ id: `evaluation-${fixture.id}`, planId: revised.id, planVersion: revised.version,
          startedAt: '2026-10-20T00:00:00.000Z', endedAt: '2026-10-20T00:05:00.000Z', status: 'completed',
          sessionIds: fixture.sessions.map((session) => session.id) }, fixture.sessions, fixture.evidence);
        result.passed = true; result.explanation = revised.explanation; result.reflection = reflection;
      } catch (error) { result.error = error instanceof Error ? error.message : String(error); }
      result.elapsedMs = performance.now() - started;
      results.push(result); options.onResult?.(result);
    }
    return results;
  } finally { options.signal?.removeEventListener('abort', abort); }
}
