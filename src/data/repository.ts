import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import { DEFAULT_SETTINGS } from '../core/types';
import type { Backup, Evidence, Execution, PlanVersion, RawEvents, Reflection, Session, Settings } from '../core/types';
import {
  EvidenceSchema, ExecutionSchema, MAX_BACKUP_BYTES, PlanVersionSchema, RawEventsSchema,
  ReflectionSchema, SessionSchema, SettingsSchema, validateBackup,
} from './schema';

export { DEFAULT_SETTINGS };

export class TypignDatabase extends Dexie {
  settings!: Table<Settings, string>;
  sessions!: Table<Session, string>;
  evidence!: Table<Evidence, string>;
  plans!: Table<PlanVersion, [string, number]>;
  executions!: Table<Execution, string>;
  reflections!: Table<Reflection, string>;
  rawEvents!: Table<RawEvents, string>;

  constructor(name = 'typign') {
    super(name);
    this.version(1).stores({
      settings: 'id', sessions: 'id, startedAt', evidence: 'id', plans: '[id+version], id',
      executions: 'id, startedAt', reflections: 'id, executionId',
      rawEvents: 'id, sessionId, createdAt',
    });
  }
}

export const db = new TypignDatabase();

export async function loadSnapshot(): Promise<Backup> {
  await pruneRawEvents();
  return db.transaction('r', db.tables, async () => ({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    settings: (await db.settings.get('settings')) ?? { ...DEFAULT_SETTINGS },
    sessions: (await db.sessions.toArray()).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id)),
    evidence: await db.evidence.toArray(),
    plans: (await db.plans.toArray()).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.version - b.version || a.id.localeCompare(b.id)),
    executions: (await db.executions.toArray()).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id)),
    reflections: (await db.reflections.toArray()).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)),
    rawEvents: (await db.rawEvents.toArray()).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)),
  }));
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put(SettingsSchema.parse(settings));
}

export async function saveSession(session: Session, rawEvent?: RawEvents): Promise<void> {
  const checked = SessionSchema.parse(session);
  const raw = rawEvent && RawEventsSchema.parse(rawEvent);
  if (raw) {
    const phrase = checked.phrases.find((p) => p.id === raw.capture.id);
    if (raw.sessionId !== session.id || !phrase || phrase.exerciseId !== raw.capture.exerciseId || phrase.exerciseVersion !== raw.capture.exerciseVersion || phrase.mode !== raw.capture.mode || phrase.guide !== raw.capture.guide || phrase.finalValue !== raw.capture.value) {
      throw new Error('生イベントと保存するセッションのフレーズが一致しません。');
    }
  }
  await db.transaction('rw', [db.sessions, db.rawEvents], async () => {
    await db.sessions.put(checked);
    if (raw) await db.rawEvents.put(raw);
    await pruneWithinTransaction(Date.now());
  });
}

export async function savePlan(plan: PlanVersion): Promise<void> {
  const checked = PlanVersionSchema.parse(plan);
  await db.transaction('rw', db.plans, async () => {
    const existing = await db.plans.get([checked.id, checked.version]);
    if (existing && JSON.stringify(existing) !== JSON.stringify(checked)) {
      throw new Error('保存済みの計画は変更できません。新しい版として保存してください。');
    }
    await db.plans.put(checked);
  });
}

export async function saveExecution(execution: Execution): Promise<void> {
  await db.executions.put(ExecutionSchema.parse(execution));
}

/** Create a block and link it to its execution in the same commit. */
export async function saveRun(session:Session, execution:Execution):Promise<void> {
  const checkedSession=SessionSchema.parse(session);
  const checkedExecution=ExecutionSchema.parse(execution);
  if(checkedSession.executionId!==checkedExecution.id || !checkedExecution.sessionIds.includes(checkedSession.id)
    || checkedSession.planId!==checkedExecution.planId || checkedSession.planVersion!==checkedExecution.planVersion) throw new Error('セッションと実施の参照が一致しません。');
  await db.transaction('rw',[db.sessions,db.executions],async()=>{
    await db.sessions.put(checkedSession);await db.executions.put(checkedExecution);
  });
}

export async function saveReflection(reflection: Reflection): Promise<void> {
  await db.reflections.put(ReflectionSchema.parse(reflection));
}

/** Existing evidence snapshots remain available to every saved plan version. */
export async function saveEvidence(evidence: Evidence[]): Promise<void> {
  const checked = evidence.map((item) => EvidenceSchema.parse(item));
  if (new Set(checked.map((item) => item.id)).size !== checked.length) throw new Error('根拠IDが重複しています。');
  await db.transaction('rw', db.evidence, async () => {
    for (const item of checked) {
      const existing = await db.evidence.get(item.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
        throw new Error('保存済みの根拠は変更できません。新しいIDとして保存してください。');
      }
    }
    await db.evidence.bulkPut(checked);
  });
}

export async function exportBackup(): Promise<string> {
  const backup = validateBackup(await loadSnapshot());
  const text = JSON.stringify(backup, null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('バックアップが復元上限の50 MiBを超えています。');
  }
  return text;
}

export function parseBackup(text: string): Backup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new Error('バックアップは50 MiB以内にしてください。');
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('JSONファイルを読み取れませんでした。'); }
  try { return validateBackup(value); }
  catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      if (first?.path[0] === 'schemaVersion') throw new Error('対応していないバックアップの版です。');
      throw new Error(first?.code === 'custom' ? `バックアップを復元できません。${first.message}` : 'バックアップの設定または記録の形式が正しくありません。');
    }
    throw error;
  }
}

/** A failed write aborts every clear and insertion, preserving the prior database. */
export async function restoreBackup(backup: Backup): Promise<void> {
  const checked = parseBackup(JSON.stringify(backup));
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
    await db.settings.put(checked.settings);
    await db.sessions.bulkPut(checked.sessions);
    await db.evidence.bulkPut(checked.evidence);
    await db.plans.bulkPut(checked.plans);
    await db.executions.bulkPut(checked.executions);
    await db.reflections.bulkPut(checked.reflections);
    await db.rawEvents.bulkPut(checked.rawEvents);
    await pruneWithinTransaction(Date.now());
  });
}

export async function deleteAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function pruneWithinTransaction(now: number): Promise<void> {
  const sessions = await db.sessions.toArray();
  sessions.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || a.id.localeCompare(b.id));
  const retainedSessions = new Set(sessions.slice(0, 30).map((s) => s.id));
  const cutoff = now - THIRTY_DAYS_MS;
  const expired = (await db.rawEvents.toArray()).filter((raw) =>
    !retainedSessions.has(raw.sessionId) || Date.parse(raw.createdAt) < cutoff,
  );
  if (expired.length) await db.rawEvents.bulkDelete(expired.map((raw) => raw.id));
}

export async function pruneRawEvents(now: number | Date = Date.now()): Promise<void> {
  const timestamp = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(timestamp)) throw new Error('保持期限の基準日時が不正です。');
  await db.transaction('rw', [db.sessions, db.rawEvents], () => pruneWithinTransaction(timestamp));
}
