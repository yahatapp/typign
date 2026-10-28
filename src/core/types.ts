export const MODES = ['speed', 'accuracy', 'weakness', 'new-pattern'] as const;
export type TrainingMode = typeof MODES[number];
export type PracticeMode = TrainingMode | 'diagnosis' | 'evaluation';
export const MODE_LABELS: Record<PracticeMode, string> = {
  speed: 'スピード', accuracy: '正確性', weakness: '苦手', 'new-pattern': '新パターン',
  diagnosis: '診断', evaluation: '確認',
};
export type Segment = { type: 'kana' | 'literal'; text: string };
export interface Exercise {
  id: string; version: number; display: string; reading: string; segments: Segment[];
  category: 'japanese' | 'english' | 'symbols' | 'mixed' | 'drill';
  purpose: 'practice' | 'evaluation'; difficulty: number; patterns: string[]; modes: TrainingMode[];
}
export interface InputEventRecord {
  seq: number; at: number; kind: string; value?: string; beforeValue?: string;
  selectionStart?: number; selectionEnd?: number; inputType?: string; data?: string | null;
  key?: string; code?: string; repeat?: boolean; isComposing?: boolean;
  shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean;
}
export interface PhraseCapture {
  id: string; exerciseId: string; exerciseVersion: number; mode: PracticeMode; guide: boolean;
  events: InputEventRecord[]; value: string; durationMs: number; interrupted: boolean;
}
export interface PatternObservation {
  pattern: string; opportunities: number; errorOpportunities: number; samplesMs: number[];
}
export interface Metrics {
  finalAccuracy: number | null; matchedCharacters: number; remainingErrors: number;
  insertedCharacters: number; correctionOperations: number; deletedCharacters: number;
  correctionsPer100: number | null; correctCharactersPerMinute: number | null;
  coverage: number; errorCandidates: number; transpositionCandidates: number;
  eligible: boolean; exclusions: string[]; accuracyRecordEligible: boolean;
}
export interface PhraseResult {
  id: string; exerciseId: string; exerciseVersion: number; mode: PracticeMode; guide: boolean;
  finalValue: string; acceptedPath: string; durationMs: number; metrics: Metrics;
  patterns: PatternObservation[]; ambiguous: boolean;
}
export interface Conditions {
  layout: 'JIS' | 'US'; inputMode: 'romaji'; browser: string; platform: string;
  analysisVersion: string; romanizationVersion: string;
}
export interface Session {
  id: string; startedAt: string; endedAt: string | null; mode: PracticeMode;
  status: 'active' | 'completed' | 'interrupted'; conditions: Conditions;
  phrases: PhraseResult[]; presentedExerciseIds?:string[]; planId?: string; planVersion?: number; executionId?: string;
}
export interface Evidence {
  id: string; pattern: string; from: string; to: string; conditionsKey: string;
  opportunities: number; errorOpportunities: number; sessionIds: string[];
  provisional: boolean; medianMs: number | null;
}
export interface PlanBlock {
  id: string; mode: PracticeMode; target: string; durationSeconds: number;
  exerciseIds: string[]; guide: boolean; evidenceIds: string[];
}
export interface PlanVersion {
  id: string; version: number; createdAt: string; source: 'standard' | 'ai';
  goal: string; focus: TrainingMode; totalSeconds: number; blocks: PlanBlock[];
  evidenceIds: string[]; explanation: string; nextCheck: string;
  model: string; promptVersion: string; schemaVersion: number;
}
export interface Execution {
  id: string; planId: string; planVersion: number; startedAt: string;
  endedAt: string | null; status: 'active' | 'completed' | 'interrupted'; sessionIds: string[];
}
export interface Reflection {
  id: string; executionId: string; createdAt: string; summary: string;
  nextCheck: string; userNote: string; source: 'standard' | 'ai'; evidenceIds: string[];
}
export interface Settings {
  id: 'settings'; layout: 'JIS' | 'US'; goal: string; minutes: number;
  focus: TrainingMode; guide: boolean; coachEnabled: boolean;
}
export interface RawEvents {
  id: string; sessionId: string; createdAt: string; capture: PhraseCapture;
}
export interface Backup {
  schemaVersion: 1; exportedAt: string; settings: Settings;
  sessions: Session[]; evidence: Evidence[]; plans: PlanVersion[];
  executions: Execution[]; reflections: Reflection[]; rawEvents: RawEvents[];
}
export const DEFAULT_SETTINGS: Settings = {
  id: 'settings', layout: 'JIS', goal: '打ち直しを減らす', minutes: 5,
  focus: 'accuracy', guide: true, coachEnabled: false,
};
export const ANALYSIS_VERSION = '1.0.0';
export const ROMANIZATION_VERSION = '1.0.0';
export const newId = (): string => crypto.randomUUID();
