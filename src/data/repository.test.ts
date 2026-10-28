import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXERCISES } from '../core/corpus';
import { DEFAULT_SETTINGS } from '../core/types';
import type { Backup, Evidence, PlanVersion, RawEvents, Session } from '../core/types';
import {
  db, deleteAllData, exportBackup, loadSnapshot, parseBackup, pruneRawEvents,
  restoreBackup, saveEvidence, savePlan, saveSession, saveSettings,saveRun,
} from './repository';

const now = Date.parse('2026-10-22T00:00:00.000Z');
const at = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
const exercise = () => EXERCISES[0];

function session(id = 'session-1', daysAgo = 0): Session {
  const e = exercise();
  return {
    id, startedAt: at(daysAgo), endedAt: at(daysAgo), mode: 'accuracy', status: 'completed',
    conditions: {
      layout: 'JIS', inputMode: 'romaji', browser: 'Chrome', platform: 'test',
      analysisVersion: '1.0.0', romanizationVersion: '1.0.0',
    },
    phrases: [{
      id: `phrase-${id}`, exerciseId: e.id, exerciseVersion: e.version, mode: 'accuracy',
      guide: true, finalValue: 'shi', acceptedPath: 'shi', durationMs: 1000,
      metrics: {
        finalAccuracy: 1, matchedCharacters: 3, remainingErrors: 0, insertedCharacters: 3,
        correctionOperations: 0, deletedCharacters: 0, correctionsPer100: 0,
        correctCharactersPerMinute: 180, coverage: 1, errorCandidates: 0,
        transpositionCandidates: 0, eligible: true, exclusions: [], accuracyRecordEligible: true,
      },
      patterns: [], ambiguous: false,
    }],
  };
}

function raw(s: Session): RawEvents {
  const p = s.phrases[0];
  return {
    id: `raw-${s.id}`, sessionId: s.id, createdAt: s.startedAt,
    capture: {
      id: p.id, exerciseId: p.exerciseId, exerciseVersion: p.exerciseVersion,
      mode: p.mode, guide: p.guide,
      events: [{ seq: 0, at: 0, kind: 'focus' }, { seq: 1, at: 1000, kind: 'input', value: 'shi' }],
      value: 'shi', durationMs: 1000, interrupted: false,
    },
  };
}

function backup(): Backup {
  return {
    schemaVersion: 1, exportedAt: at(0), settings: { ...DEFAULT_SETTINGS },
    sessions: [], evidence: [], plans: [], executions: [], reflections: [], rawEvents: [],
  };
}

function plan(version = 1): PlanVersion {
  const practice = EXERCISES.find((e) => e.purpose === 'practice' && e.modes.includes('accuracy'))!;
  return {
    id: 'plan-1', version, createdAt: at(0), source: 'standard', goal: '目標', focus: 'accuracy',
    totalSeconds: 60, blocks: [{
      id: 'block-1', mode: 'accuracy', target: 'shi', durationSeconds: 60,
      exerciseIds: [practice.id], guide: true, evidenceIds: [],
    }],
    evidenceIds: [], explanation: '根拠', nextCheck: '確認', model: 'standard',
    promptVersion: '1.0.0', schemaVersion: 1,
  };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  await deleteAllData();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('local persistence', () => {
  it('commits execution membership and its active session atomically',async()=>{
    const s={...session(),status:'active' as const,endedAt:null,planId:'plan-1',planVersion:1,executionId:'run'};
    const execution={id:'run',planId:'plan-1',planVersion:1,startedAt:s.startedAt,endedAt:null,status:'active' as const,sessionIds:[s.id]};
    await savePlan(plan());
    const hook=()=>{throw new Error('quota');};db.executions.hook('creating',hook);
    try{await expect(saveRun(s,execution)).rejects.toThrow('quota');expect(await db.sessions.count()).toBe(0);}
    finally{db.executions.hook('creating').unsubscribe(hook);}
    await saveRun(s,execution);expect(parseBackup(await exportBackup()).executions[0].sessionIds).toEqual([s.id]);
  });
  it('loads defaults on a fresh database and preserves current settings separately from session conditions', async () => {
    expect((await loadSnapshot()).settings).toEqual(DEFAULT_SETTINGS);
    const saved = session();
    await saveSession(saved, raw(saved));
    await saveSettings({ ...DEFAULT_SETTINGS, layout: 'US', goal: '速度' });
    const reopened = parseBackup(await exportBackup());
    expect(reopened.settings.layout).toBe('US');
    expect(reopened.sessions[0].conditions.layout).toBe('JIS');
    expect(reopened.rawEvents).toHaveLength(1);
  });

  it('persists deletion of the goal and loads sessions and plan versions in chronological order', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, goal: '' });
    await saveSession(session('a-new', 0));
    await saveSession(session('z-old', 1));
    await savePlan({ ...plan(2), createdAt: at(0) });
    await savePlan({ ...plan(1), createdAt: at(1) });
    const stored = await loadSnapshot();
    expect(stored.settings.goal).toBe('');
    expect(stored.sessions.map((s) => s.id)).toEqual(['z-old', 'a-new']);
    expect(stored.plans.map((p) => p.version)).toEqual([1, 2]);
  });

  it('restores a full replacement and accepts distinct versions of the same plan', async () => {
    await saveSession(session('old'));
    const imported = backup();
    imported.sessions = [session('new')];
    imported.rawEvents = [raw(imported.sessions[0])];
    imported.plans = [plan(1), plan(2)];
    await restoreBackup(imported);
    expect((await loadSnapshot()).sessions.map((s) => s.id)).toEqual(['new']);
    expect((await loadSnapshot()).plans.map((p) => p.version)).toEqual([1, 2]);
  });

  it('keeps prior plan versions and evidence snapshots immutable while allowing idempotent retries', async () => {
    const s = session(); await saveSession(s);
    const evidence: Evidence = {
      id: 'ev-1', pattern: 'shi', from: at(0), to: at(0), conditionsKey: 'condition',
      opportunities: 31, errorOpportunities: 3, sessionIds: [s.id], provisional: false, medianMs: 100,
    };
    await saveEvidence([evidence]); await saveEvidence([evidence]);
    await savePlan(plan()); await savePlan(plan());
    await expect(savePlan({ ...plan(), goal: 'changed' })).rejects.toThrow('新しい版');
    await expect(saveEvidence([{ ...evidence, errorOpportunities: 4 }])).rejects.toThrow('新しいID');
    await savePlan(plan(2));
    const stored = await loadSnapshot();
    expect(stored.plans[0].goal).toBe('目標');
    expect(stored.plans).toHaveLength(2);
    expect(stored.evidence[0].errorOpportunities).toBe(3);
  });

  it('round-trips the full evidence → plan version → execution → session → reflection graph', async () => {
    const imported = backup();
    const s: Session = { ...session(), planId: 'plan-1', planVersion: 2, executionId: 'execution-1' };
    const evidence: Evidence = { id: 'e-1', pattern: 'shi', from: at(0), to: at(0), conditionsKey: 'conditions', opportunities: 30, errorOpportunities: 3, sessionIds: [s.id], provisional: false, medianMs: 100 };
    const p = plan(2); p.evidenceIds = [evidence.id]; p.blocks[0].evidenceIds = [evidence.id];
    imported.sessions = [s]; imported.evidence = [evidence]; imported.plans = [p];
    imported.executions = [{ id: 'execution-1', planId: p.id, planVersion: p.version, startedAt: at(0), endedAt: at(0), status: 'completed', sessionIds: [s.id] }];
    imported.reflections = [{ id: 'reflection-1', executionId: 'execution-1', createdAt: at(0), summary: '確認した', nextCheck: '明日', userNote: '', source: 'standard', evidenceIds: [evidence.id] }];
    imported.rawEvents = [raw(s)];
    await restoreBackup(parseBackup(JSON.stringify(imported)));
    expect(parseBackup(await exportBackup())).toEqual(imported);
  });

  it('aborts the entire replacement when a database write fails after old tables were cleared', async () => {
    const original = session('original');
    await saveSession(original, raw(original));
    const imported = backup();
    imported.sessions = [session('imported')];
    const fail = () => { throw new Error('simulated quota'); };
    db.sessions.hook('creating', fail);
    try {
      await expect(restoreBackup(imported)).rejects.toThrow('simulated quota');
    } finally {
      db.sessions.hook('creating').unsubscribe(fail);
    }
    const retained = await loadSnapshot();
    expect(retained.sessions).toEqual([original]);
    expect(retained.rawEvents).toEqual([raw(original)]);
  });

  it('surfaces write failure and rolls back the phrase when its raw-event write fails', async () => {
    const fail = () => { throw new Error('simulated storage disabled'); };
    const s = session();
    db.rawEvents.hook('creating', fail);
    try {
      await expect(saveSession(s, raw(s))).rejects.toThrow('simulated storage disabled');
    } finally {
      db.rawEvents.hook('creating').unsubscribe(fail);
    }
    expect((await loadSnapshot()).sessions).toEqual([]);
    expect((await loadSnapshot()).rawEvents).toEqual([]);
  });

  it('keeps only raw events from the most recent 30 sessions and at most 30 days, preserving summaries and evidence', async () => {
    const imported = backup();
    imported.sessions = Array.from({ length: 32 }, (_, i) => session(`s-${i}`, i / 2));
    imported.sessions.push(session('old-by-date', 31));
    imported.rawEvents = imported.sessions.map(raw);
    const evidence: Evidence = {
      id: 'ev-1', pattern: 'shi', from: at(31), to: at(0), conditionsKey: 'condition',
      opportunities: 31, errorOpportunities: 3, sessionIds: ['s-31', 'old-by-date'],
      provisional: false, medianMs: 100,
    };
    imported.evidence = [evidence];
    await restoreBackup(imported);
    let stored = await loadSnapshot();
    expect(stored.rawEvents).toHaveLength(30);
    expect(stored.rawEvents.some((r) => r.sessionId === 's-31')).toBe(false);
    expect(stored.rawEvents.some((r) => r.sessionId === 'old-by-date')).toBe(false);
    expect(stored.sessions).toHaveLength(33);
    expect(stored.evidence).toEqual([evidence]);
    await pruneRawEvents(new Date(now + 31 * 86_400_000));
    stored = await loadSnapshot();
    expect(stored.rawEvents).toHaveLength(0);
    expect(stored.sessions).toHaveLength(33);
    expect(stored.evidence).toEqual([evidence]);
  });

  it('applies the age limit even when there are fewer than 30 sessions, and retains the exact cutoff', async () => {
    const imported = backup();
    imported.sessions = [session('at-cutoff', 30), session('expired', 31)];
    imported.rawEvents = imported.sessions.map(raw);
    await restoreBackup(imported);
    const stored = await loadSnapshot();
    expect(stored.rawEvents.map((r) => r.sessionId)).toEqual(['at-cutoff']);
    expect(stored.sessions).toHaveLength(2);
  });

  it('deletes every data category and returns default preferences on the next visit', async () => {
    const imported = backup();
    imported.settings.goal = '個人の希望';
    imported.sessions = [session()];
    imported.rawEvents = [raw(imported.sessions[0])];
    imported.plans = [plan()];
    await restoreBackup(imported);
    await deleteAllData();
    expect(await loadSnapshot()).toEqual(backup());
  });
});

describe('backup validation', () => {
  it('rejects unsupported schema, unknown fields, malformed JSON, invalid ratios, and nonfinite metrics', () => {
    expect(() => parseBackup('{')).toThrow('JSON');
    expect(() => parseBackup(JSON.stringify({ ...backup(), schemaVersion: 2 }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...backup(), injected: '<script>' }))).toThrow();
    const b = backup(); b.sessions = [session()];
    b.sessions[0].phrases[0].metrics.coverage = 101;
    expect(() => parseBackup(JSON.stringify(b))).toThrow();
    b.sessions[0].phrases[0].metrics.coverage = 1;
    b.sessions[0].phrases[0].metrics.correctCharactersPerMinute = Infinity;
    // JSON normalizes Infinity to null; null is a legitimate unavailable metric.
    b.sessions[0].phrases[0].metrics.matchedCharacters = Infinity;
    expect(() => parseBackup(JSON.stringify(b))).toThrow();
  });

  it('rejects duplicate identifiers, duplicate plan versions, missing references and unsupported exercise versions', () => {
    const b = backup();
    b.sessions = [session(), session()];
    expect(() => parseBackup(JSON.stringify(b))).toThrow();
    b.sessions = [];
    b.plans = [plan(), plan()];
    expect(() => parseBackup(JSON.stringify(b))).toThrow();
    b.plans = [plan()];
    b.plans[0].evidenceIds = ['missing-evidence'];
    expect(() => parseBackup(JSON.stringify(b))).toThrow();
    b.plans = [];
    b.sessions = [session()];
    b.sessions[0].phrases[0].exerciseVersion += 1;
    expect(() => parseBackup(JSON.stringify(b))).toThrow();
  });

  it('rejects invalid execution, reflection and raw capture references', () => {
    const b = backup();
    b.sessions = [session()];
    b.rawEvents = [raw(b.sessions[0])];
    b.rawEvents[0].capture.value = 'different';
    expect(() => parseBackup(JSON.stringify(b))).toThrow();
    b.rawEvents = [];
    b.executions = [{ id: 'execution', planId: 'missing', planVersion: 1, startedAt: at(0), endedAt: null, status: 'active', sessionIds: [] }];
    expect(() => parseBackup(JSON.stringify(b))).toThrow();
    b.executions = [];
    b.reflections = [{ id: 'reflection', executionId: 'missing', createdAt: at(0), summary: '', nextCheck: '', userNote: '', source: 'standard', evidenceIds: [] }];
    expect(() => parseBackup(JSON.stringify(b))).toThrow();
  });

  it('rejects an oversized import before parsing it, and leaves saved data intact after invalid replacement', async () => {
    expect(() => parseBackup(' '.repeat(50 * 1024 * 1024 + 1))).toThrow('50 MiB');
    await saveSession(session('original'));
    const b = backup(); b.sessions = [session('new')]; b.sessions[0].planId = 'missing';
    await expect(restoreBackup(b)).rejects.toThrow();
    expect((await loadSnapshot()).sessions[0].id).toBe('original');
  });
});
