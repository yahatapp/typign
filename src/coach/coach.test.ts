import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXERCISES } from '../core/corpus';
import { DEFAULT_SETTINGS, MODES, type PlanVersion, type Session } from '../core/types';
import { buildEvidence, compareConditions, getRetentionChecks } from './evidence';
import { buildPlanCandidates, buildStandardPlan, validatePlan } from './planner';
import { createCoachFixtures } from './fixtures';
import { Coach } from './chrome';

const clone = <T>(value: T): T => structuredClone(value);
const content = (plan: PlanVersion) => {
  const { goal, focus, totalSeconds, blocks, evidenceIds, explanation, nextCheck } = plan;
  return { goal, focus, totalSeconds, blocks, evidenceIds, explanation, nextCheck };
};
afterEach(() => vi.unstubAllGlobals());

describe('deterministic evidence', () => {
  it('has twenty synthetic, anonymous fixtures and reproducible immutable snapshots', () => {
    const fixtures = createCoachFixtures();
    expect(fixtures).toHaveLength(20);
    const fixture = fixtures[4];
    expect(fixture.evidence.length).toBeGreaterThan(0);
    expect(fixture.evidence[0].opportunities).toBe(60);
    expect(fixture.evidence[0].errorOpportunities).toBe(12);
    expect(fixture.evidence[0].provisional).toBe(false);
    expect(buildEvidence([...fixture.sessions].reverse())).toEqual(fixture.evidence);
    const changed = clone(fixture.sessions);
    changed[0].phrases[0].patterns[0].errorOpportunities++;
    expect(buildEvidence(changed)[0].id).not.toBe(fixture.evidence[0].id);
  });

  it('does not combine layouts, guides, modes or analysis versions', () => {
    const fixtures = createCoachFixtures();
    expect(fixtures[7].evidence).toHaveLength(2);
    expect(fixtures[9].evidence).toHaveLength(2);
    expect(fixtures[15].evidence).toHaveLength(2);
    expect(fixtures[12].evidence).toEqual([]);
    expect(fixtures[13].evidence).toEqual([]);
    expect(fixtures[14].evidence).toEqual([]);
  });

  it('requires repeated errors, not only repeated sessions, before lifting provisional status', () => {
    const sessions = clone(createCoachFixtures()[4].sessions);
    sessions[1].phrases[0].patterns[0].errorOpportunities = 0;
    sessions[2].phrases[0].patterns[0].errorOpportunities = 0;
    expect(buildEvidence(sessions)[0].provisional).toBe(true);
  });

  it('includes eligible timing samples in snapshot identities and uses a true median', () => {
    const sessions = clone(createCoachFixtures()[5].sessions);
    for (const session of sessions) session.phrases[0].patterns[0].samplesMs = [100, 200];
    const evidence = buildEvidence(sessions);
    expect(evidence[0].medianMs).toBe(150);
    sessions[0].phrases[0].patterns[0].samplesMs = [300, 400];
    expect(buildEvidence(sessions)[0].id).not.toBe(evidence[0].id);
    sessions[0].phrases[0].metrics.correctionOperations = 1;
    expect(buildEvidence(sessions)[0].medianMs).toBe(150);
  });

  it('compares only distinct cohorts with matching text, path, mode and environment', () => {
    const sessions = clone(createCoachFixtures()[4].sessions);
    const ids = sessions.map((s) => s.id);
    const comparison = compareConditions(sessions, [ids[0]], [ids[1]]);
    expect(comparison.comparable).toBe(true);
    if (comparison.comparable) expect(comparison.first.correctCharactersPerMinute).toBe(120);
    sessions[1].phrases[0].acceptedPath = 'different-path';
    expect(compareConditions(sessions, [ids[0]], [ids[1]]).comparable).toBe(false);
    expect(compareConditions(sessions, [ids[0]], [ids[0]]).comparable).toBe(false);
    expect(() => compareConditions(sessions, ['missing'], [ids[1]])).toThrow();
  });

  it('distinguishes immediate checks from retention on a later day', () => {
    const sessions = clone(createCoachFixtures()[16].sessions);
    const last = sessions[sessions.length - 1];
    expect(getRetentionChecks(sessions, new Date('2026-10-20T00:00:00Z'))[0].due).toBe(true);
    const evaluation: Session = { ...clone(last), id: 'later-check', startedAt: '2026-10-19T10:00:00Z', mode: 'evaluation' };
    evaluation.phrases[0].mode = 'evaluation';
    expect(getRetentionChecks([...sessions, evaluation], new Date('2026-10-20T00:00:00Z'))).toEqual([]);
    evaluation.startedAt = '2026-10-17T10:05:00Z';
    expect(getRetentionChecks([...sessions, evaluation], new Date('2026-10-20T00:00:00Z'))).toHaveLength(1);
  });
});

describe('validated plans', () => {
  it('treats presented but unanswered evaluation exercises as seen',()=>{
    const original=buildStandardPlan(DEFAULT_SETTINGS,[],[]);
    const shown=original.blocks.find(b=>b.mode==='evaluation')!.exerciseIds[0];
    const session={...createCoachFixtures()[4].sessions[0],phrases:[],presentedExerciseIds:[shown]};
    expect(buildStandardPlan(DEFAULT_SETTINGS,[],[session]).blocks.find(b=>b.mode==='evaluation')?.exerciseIds).not.toContain(shown);
  });
  it.each(MODES)('supports %s as the sole training mode plus a separate check', (focus) => {
    const settings = { ...DEFAULT_SETTINGS, focus };
    const plan = buildStandardPlan(settings, [], []);
    expect(plan.blocks.filter((b) => b.mode !== 'evaluation').map((b) => b.mode)).toEqual([focus]);
    expect(plan.blocks.find((b) => b.mode === 'evaluation')?.guide).toBe(false);
    expect(plan.blocks.reduce((sum, b) => sum + b.durationSeconds, 0)).toBe(settings.minutes * 60);
    expect(validatePlan(plan, settings, [], [])).toEqual(plan);
  });

  it('makes new versions without modifying the selected plan or its evidence', () => {
    const fixture = createCoachFixtures()[4];
    const first = buildStandardPlan(fixture.settings, fixture.evidence, fixture.sessions);
    const original = clone(first);
    const next = buildStandardPlan({ ...fixture.settings, minutes: 3 }, fixture.evidence, fixture.sessions, first);
    expect(first).toEqual(original);
    expect(next.id).toBe(first.id);
    expect(next.version).toBe(2);
    expect(next.totalSeconds).toBe(180);
  });

  it('allows the user to delete their goal', () => {
    const settings = { ...DEFAULT_SETTINGS, goal: '' };
    const plan = buildStandardPlan(settings, [], []);
    expect(plan.goal).toBe('');
    expect(validatePlan(plan, settings, [], [])).toEqual(plan);
  });

  it('validates all twenty aggregate scenarios without claiming an AI source', () => {
    for (const fixture of createCoachFixtures()) {
      const plan = buildStandardPlan(fixture.settings, fixture.evidence, fixture.sessions);
      expect(plan.source).toBe('standard');
      expect(validatePlan(plan, fixture.settings, fixture.evidence, fixture.sessions)).toEqual(plan);
    }
  });

  it('rejects unknown evidence, unknown exercises, invalid purpose, over-budget and mismatched sums', () => {
    const settings = { ...DEFAULT_SETTINGS };
    const plan = buildStandardPlan(settings, [], []);
    const unknownEvidence = clone(plan); unknownEvidence.evidenceIds = ['unknown'];
    expect(() => validatePlan(unknownEvidence, settings, [], [])).toThrow();
    const unknownExercise = clone(plan); unknownExercise.blocks[0].exerciseIds = ['unknown'];
    expect(() => validatePlan(unknownExercise, settings, [], [])).toThrow();
    const wrongPurpose = clone(plan); wrongPurpose.blocks[0].exerciseIds = [EXERCISES.find((x) => x.purpose === 'evaluation')!.id];
    expect(() => validatePlan(wrongPurpose, settings, [], [])).toThrow();
    const over = clone(plan); over.totalSeconds += 1; over.blocks[0].durationSeconds += 1;
    expect(() => validatePlan(over, settings, [], [])).toThrow();
    const wrongSum = clone(plan); wrongSum.totalSeconds -= 1;
    expect(() => validatePlan(wrongSum, settings, [], [])).toThrow();
  });

  it('rejects seen evaluation material and reveals exhaustion without substituting practice', () => {
    const settings = { ...DEFAULT_SETTINGS };
    const plan = buildStandardPlan(settings, [], []);
    const fixture = clone(createCoachFixtures()[4].sessions[0]);
    const evaluation = plan.blocks.find((b) => b.mode === 'evaluation')!;
    fixture.phrases = EXERCISES.filter((x) => x.purpose === 'evaluation').map((x) => ({ ...clone(fixture.phrases[0]), exerciseId: x.id, exerciseVersion: x.version }));
    expect(fixture.phrases.some((p) => evaluation.exerciseIds.includes(p.exerciseId))).toBe(true);
    expect(() => validatePlan(plan, settings, [], [fixture])).toThrow();
    const exhausted = buildStandardPlan(settings, [], [fixture]);
    expect(exhausted.blocks.every((b) => b.mode !== 'evaluation')).toBe(true);
    expect(exhausted.nextCheck).toContain('使い切っています');
  });

  it('rejects evidence from a different layout and respects user settings', () => {
    const fixture = createCoachFixtures()[4];
    const plan = buildStandardPlan(fixture.settings, fixture.evidence, fixture.sessions);
    const changedEvidence = clone(fixture.evidence);
    changedEvidence[0].conditionsKey = JSON.stringify({ layout: 'US' });
    expect(() => validatePlan(plan, fixture.settings, changedEvidence, fixture.sessions)).toThrow();
    const changedGuide = clone(plan); changedGuide.blocks[0].guide = !fixture.settings.guide;
    expect(() => validatePlan(changedGuide, fixture.settings, fixture.evidence, fixture.sessions)).toThrow();
    const changedGoal = clone(plan); changedGoal.goal = '別の目標';
    expect(() => validatePlan(changedGoal, fixture.settings, fixture.evidence, fixture.sessions)).toThrow();
  });
});

function mockAPI(outputs: unknown[]) {
  const prompt = vi.fn(async (_input: string, _options?: { signal: AbortSignal; responseConstraint?: unknown }) => JSON.stringify(outputs.shift()));
  const local = { prompt, destroy: vi.fn() };
  const session = { clone: vi.fn(async () => local), destroy: vi.fn() };
  const availability = vi.fn(async (_options: Record<string, unknown>) => 'available' as const);
  const create = vi.fn(async (_options: Record<string, unknown>) => session);
  vi.stubGlobal('LanguageModel', { availability, create });
  return { prompt, local, session, availability, create };
}

describe('Chrome Prompt API adapter', () => {
  it('keeps the absent-API path explicit and never auto-downloads', async () => {
    vi.stubGlobal('LanguageModel', undefined);
    const coach = new Coach();
    expect(await coach.availability()).toBe('unavailable');
    await expect(coach.init()).rejects.toThrow('利用できません');
    await expect(coach.propose(DEFAULT_SETTINGS, [], [])).rejects.toThrow('準備');
  });

  it('uses the same Japanese options for availability/create and reports progress', async () => {
    const api = mockAPI([]);
    const coach = new Coach();
    await coach.availability();
    const progress = vi.fn();
    api.create.mockImplementation(async (options) => {
      const monitor = new EventTarget();
      (options.monitor as (target: EventTarget) => void)(monitor);
      const event = new Event('downloadprogress');
      Object.defineProperty(event, 'loaded', { value: 0.25 }); monitor.dispatchEvent(event);
      return api.session;
    });
    await coach.init(progress);
    expect(progress).toHaveBeenCalledWith(0.25);
    expect(api.create.mock.calls[0][0]).toMatchObject(api.availability.mock.calls[0][0]);
    expect(coach.status).toBe('ready');
    coach.destroy(); expect(api.session.destroy).toHaveBeenCalled();
  });

  it('runs actual bounded tool operations, validates a plan and labels the generated result', async () => {
    const plan = buildStandardPlan(DEFAULT_SETTINGS, [], []);
    const api = mockAPI([
      { kind: 'tool', name: 'getPatternEvidence', arguments: {} },
      { kind: 'tool', name: 'buildPlanCandidates', arguments: {} },
      { kind: 'plan', plan: content(plan) },
    ]);
    const coach = new Coach(); await coach.init();
    const result = await coach.propose(DEFAULT_SETTINGS, [], []);
    expect(result.source).toBe('ai'); expect(result.model).toBe('chrome-gemini-nano');
    expect(api.prompt).toHaveBeenCalledTimes(3);
    expect(JSON.parse(api.prompt.mock.calls[1][0] as unknown as string).result).toEqual([]);
    expect(api.local.destroy).toHaveBeenCalled();
    expect(coach.status).toBe('ready');
  });

  it('extracts a natural-language request before rebuilding time and focus constraints', async () => {
    const originalSettings = { ...DEFAULT_SETTINGS, focus: 'speed' as const };
    const previous = buildStandardPlan(originalSettings, [], []);
    const requestedSettings = { ...originalSettings, minutes: 3, focus: 'accuracy' as const };
    const requested = buildStandardPlan(requestedSettings, [], [], previous);
    const api = mockAPI([
      { minutes: 3, focus: 'accuracy', target: null },
      { kind: 'tool', name: 'getPatternEvidence', arguments: {} },
      { kind: 'tool', name: 'buildPlanCandidates', arguments: {} },
      { kind: 'plan', plan: content(requested) },
    ]);
    const coach = new Coach(); await coach.init();
    const revised = await coach.propose(originalSettings, [], [], previous, '今日は3分、正確性重視にしたい');
    expect(revised.totalSeconds).toBe(180); expect(revised.focus).toBe('accuracy');
    expect(revised.id).toBe(previous.id); expect(revised.version).toBe(previous.version + 1);
    expect(originalSettings.minutes).toBe(5); expect(originalSettings.focus).toBe('speed');
    const candidates = JSON.parse(api.prompt.mock.calls[3][0]).result;
    expect(candidates.standardPlan.focus).toBe('accuracy'); expect(candidates.standardPlan.totalSeconds).toBe(180);
  });

  it('reflects an explicitly requested supported pattern in a single training mode', async () => {
    const target = EXERCISES.find((exercise) => exercise.purpose === 'practice' && exercise.patterns.length)!.patterns[0];
    const candidate = buildPlanCandidates(DEFAULT_SETTINGS, [], [], undefined, target).standardPlan;
    const api = mockAPI([
      { minutes: null, focus: null, target },
      { kind: 'tool', name: 'getPatternEvidence', arguments: {} },
      { kind: 'tool', name: 'buildPlanCandidates', arguments: {} },
      { kind: 'plan', plan: content(candidate) },
    ]);
    const coach = new Coach(); await coach.init();
    const plan = await coach.propose(DEFAULT_SETTINGS, [], [], undefined, `${target}を練習したい`);
    expect(plan.blocks.filter((block) => block.mode !== 'evaluation')).toHaveLength(1);
    const practice = plan.blocks[0]; expect(practice.target).toBe(target);
    expect(practice.exerciseIds.every((id) => EXERCISES.find((e) => e.id === id)?.patterns.includes(target))).toBe(true);
    expect(api.prompt).toHaveBeenCalledTimes(4);
  });

  it('carries bounded user notes and prior reflections without adding original typed text', async () => {
    const sessions = clone(createCoachFixtures()[4].sessions);
    sessions[0].phrases[0].finalValue = 'PRIVATE_RAW_TEXT_NOT_FOR_THE_MODEL';
    const plan = buildStandardPlan(DEFAULT_SETTINGS, [], sessions);
    const api = mockAPI([
      { kind: 'tool', name: 'getPatternEvidence', arguments: {} },
      { kind: 'tool', name: 'buildPlanCandidates', arguments: {} },
      { kind: 'plan', plan: content(plan) },
    ]);
    const coach = new Coach(); await coach.init();
    await coach.propose(DEFAULT_SETTINGS, [], sessions, undefined, undefined, {
      userNotes: Array.from({ length: 8 }, (_, index) => `${index}-${'感想'.repeat(800)}`),
      previousReflections: Array.from({ length: 6 }, (_, index) => ({ summary: `${index}-${'振り返り'.repeat(400)}`, nextCheck: '後日に確認' })),
    });
    const input = api.prompt.mock.calls[0][0];
    expect(input).not.toContain('PRIVATE_RAW_TEXT_NOT_FOR_THE_MODEL');
    const context = JSON.parse(input).userContext;
    expect(context.userNotes).toHaveLength(5);
    expect(context.userNotes[0]).toHaveLength(1000);
    expect(context.userNotes[0]).toMatch(/^3-/);
    expect(context.previousReflections).toHaveLength(3);
    expect(context.previousReflections[0].summary).toHaveLength(800);
    expect(context.previousReflections[0].summary).toMatch(/^3-/);
  });

  it('rejects invented preference targets and out-of-range requested durations', async () => {
    const api = mockAPI([{ minutes: 3, focus: null, target: 'not-in-the-corpus' }]);
    const coach = new Coach(); await coach.init();
    await expect(coach.propose(DEFAULT_SETTINGS, [], [], undefined, 'この対象を練習したい')).rejects.toThrow('教材');
    api.prompt.mockResolvedValueOnce(JSON.stringify({ minutes: 31, focus: null, target: null }));
    await expect(coach.propose(DEFAULT_SETTINGS, [], [], undefined, '三十一分')).rejects.toThrow();
  });

  it('reflects deterministic execution totals and never implies observation when there is no session', async () => {
    const api = mockAPI([
      { kind: 'tool', name: 'getPatternEvidence', arguments: {} },
      { kind: 'reflection', reflection: { summary: 'まだ結果の観測がありません。', nextCheck: '練習を終えてから確認しましょう。', evidenceIds: [] } },
    ]);
    const coach = new Coach(); await coach.init();
    const result = await coach.reflect({ id: 'execution', planId: 'plan', planVersion: 1,
      startedAt: '2026-10-20T00:00:00Z', endedAt: null, status: 'interrupted', sessionIds: [] }, [], []);
    expect(result.summary).toContain('観測がありません');
    expect(JSON.parse(api.prompt.mock.calls[0][0]).observedTotals).toMatchObject({
      sessionCount: 0, phraseCount: 0, eligiblePhraseCount: 0, correctionOperations: 0, remainingErrors: 0,
    });
  });

  it('rejects a fabricated fact or unknown operation without replacing it with a fake AI result', async () => {
    const plan = buildStandardPlan(DEFAULT_SETTINGS, [], []);
    const api = mockAPI([
      { kind: 'tool', name: 'getPatternEvidence', arguments: {} },
      { kind: 'tool', name: 'buildPlanCandidates', arguments: {} },
      ...Array.from({ length: 6 }, () => ({ kind: 'plan', plan: { ...content(plan), explanation: '誤りは99件です。' } })),
    ]);
    const coach = new Coach(); await coach.init();
    await expect(coach.propose(DEFAULT_SETTINGS, [], [])).rejects.toThrow('検証');
    expect(api.prompt).toHaveBeenCalledTimes(8);
    expect(coach.lastError).toBeTruthy();
  });

  it('aborts generation and frees the request session while retaining an initialized coach', async () => {
    const api = mockAPI([]);
    const coach = new Coach(); await coach.init();
    api.prompt.mockImplementation((_input?: string, options?: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options?.signal.addEventListener('abort', () => reject(new DOMException('中断', 'AbortError')));
    }));
    const generation = coach.propose(DEFAULT_SETTINGS, [], []);
    await vi.waitFor(() => expect(api.prompt).toHaveBeenCalled());
    coach.cancel();
    await expect(generation).rejects.toMatchObject({ name: 'AbortError' });
    expect(api.local.destroy).toHaveBeenCalled();
    expect(coach.status).toBe('ready');
  });
});
