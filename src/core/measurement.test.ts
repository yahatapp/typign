import { describe, expect, it } from 'vitest';
import { aggregateMetrics, analyzePhrase } from './measurement';
import type { Exercise, InputEventRecord, PhraseCapture } from './types';

function target(text: string, kana = false): Exercise {
  return { id: 'test', version: 1, display: text, reading: text, segments: [{ type: kana ? 'kana' : 'literal', text }], category: kana ? 'japanese' : 'english', purpose: 'practice', difficulty: 1, patterns: ['ng', 'ty', 'ab', 'si', 'sh'], modes: ['accuracy'] };
}

class Capture {
  value = ''; at = 0; seq = 0; events: InputEventRecord[] = [];
  push(event: Omit<InputEventRecord, 'seq' | 'at'>): void { this.events.push({ ...event, seq: this.seq++, at: this.at }); this.at += 20; }
  insert(text: string, start = this.value.length, end = start): this {
    for (const character of text) {
      this.push({ kind: 'keydown', key: character, code: `Key${character.toUpperCase()}` });
      const before = this.value;
      this.push({ kind: 'beforeinput', value: before, selectionStart: start, selectionEnd: end, inputType: 'insertText', data: character });
      this.value = before.slice(0, start) + character + before.slice(end);
      this.push({ kind: 'input', beforeValue: before, value: this.value, inputType: 'insertText', data: character, selectionStart: start + 1, selectionEnd: start + 1 });
      start++; end = start;
    }
    return this;
  }
  remove(start: number, end: number, forward = false): this {
    const before = this.value;
    const inputType = forward ? 'deleteContentForward' : 'deleteContentBackward';
    this.push({ kind: 'keydown', key: forward ? 'Delete' : 'Backspace' });
    this.push({ kind: 'beforeinput', value: before, selectionStart: start, selectionEnd: end, inputType });
    const from = start === end && !forward ? Math.max(0, start - 1) : start;
    const to = start === end && forward ? Math.min(before.length, end + 1) : end;
    this.value = before.slice(0, from) + before.slice(to);
    this.push({ kind: 'input', beforeValue: before, value: this.value, inputType });
    return this;
  }
  data(exercise: Exercise, extra: Partial<PhraseCapture> = {}): PhraseCapture {
    return { id: 'capture', exerciseId: exercise.id, exerciseVersion: exercise.version, mode: 'accuracy', guide: false, events: this.events, value: this.value, durationMs: 1000, interrupted: false, ...extra };
  }
}

describe('event replay and conservative measurement', () => {
  it('measures a directly typed sequence, matching the actual allowed path', () => {
    const exercise = target('し', true);
    const capture = new Capture().insert('si');
    const phrase = analyzePhrase(exercise, capture.data(exercise));
    expect(phrase.acceptedPath).toBe('si');
    expect(phrase.metrics).toMatchObject({ finalAccuracy: 1, matchedCharacters: 2, remainingErrors: 0, insertedCharacters: 2, correctionOperations: 0, coverage: 1, eligible: true, accuracyRecordEligible: true, correctCharactersPerMinute: 120 });
    expect(phrase.patterns.find((pattern) => pattern.pattern === 'si')?.samplesMs).toEqual([60]);
  });

  it('retains corrected ing→ign, distinguishes two error characters from one swap candidate', () => {
    const exercise = target('typing');
    const capture = new Capture().insert('typign').remove(6, 6).remove(5, 5).insert('ng');
    const phrase = analyzePhrase(exercise, capture.data(exercise));
    expect(phrase.metrics).toMatchObject({ finalAccuracy: 1, remainingErrors: 0, errorCandidates: 2, transpositionCandidates: 1, correctionOperations: 2, deletedCharacters: 2, insertedCharacters: 8, accuracyRecordEligible: false });
    expect(phrase.patterns.find((pattern) => pattern.pattern === 'ng')).toMatchObject({ opportunities: 1, errorOpportunities: 1, samplesMs: [] });
    const uncorrected = new Capture().insert('typign');
    expect(analyzePhrase(exercise, uncorrected.data(exercise)).metrics).toMatchObject({ remainingErrors: 2, transpositionCandidates: 1 });
    expect(analyzePhrase(exercise, uncorrected.data(exercise)).metrics.finalAccuracy).toBeCloseTo(2 / 3);
  });

  it('records correct deletions and route changes without inventing mistakes', () => {
    const literal = target('abc');
    const correctDeletion = new Capture().insert('abc').remove(3, 3).insert('c');
    expect(analyzePhrase(literal, correctDeletion.data(literal)).metrics).toMatchObject({ errorCandidates: 0, correctionOperations: 1, finalAccuracy: 1, accuracyRecordEligible: false });
    const middleDeletion = new Capture().insert('abc').remove(1, 2).insert('b', 1);
    expect(analyzePhrase(literal, middleDeletion.data(literal)).metrics.errorCandidates).toBe(0);
    const kana = target('し', true);
    const routeChange = new Capture().insert('shi').remove(1, 2, true);
    const changed = analyzePhrase(kana, routeChange.data(kana));
    expect(changed.acceptedPath).toBe('si');
    expect(changed.metrics.errorCandidates).toBe(0);
  });

  it('handles selection replacement, forward deletion, cursor insertion and repeated characters', () => {
    const exercise = target('abc');
    const replaced = new Capture().insert('axc').insert('b', 1, 2);
    expect(analyzePhrase(exercise, replaced.data(exercise)).metrics).toMatchObject({ finalAccuracy: 1, errorCandidates: 1, correctionOperations: 1, deletedCharacters: 1 });
    const forward = new Capture().insert('axbc').remove(1, 1, true);
    expect(analyzePhrase(exercise, forward.data(exercise)).metrics).toMatchObject({ finalAccuracy: 1, errorCandidates: 1, correctionOperations: 1 });
    const omission = new Capture().insert('ac').insert('b', 1);
    expect(analyzePhrase(exercise, omission.data(exercise)).metrics).toMatchObject({ finalAccuracy: 1, errorCandidates: 1, correctionOperations: 0 });
    const repeated = target('aa');
    const selected = new Capture().insert('aaa').remove(1, 2, true);
    expect(analyzePhrase(repeated, selected.data(repeated)).metrics.correctionOperations).toBe(1);
  });

  it.each(['paste', 'drop', 'ime', 'repeat', 'autofill', 'interruption'])('excludes %s from physical typing speed without discarding the final result', (reason) => {
    const exercise = target('abc');
    const capture = new Capture().insert('abc');
    if (reason === 'paste') capture.push({ kind: 'paste' });
    if (reason === 'drop') capture.push({ kind: 'drop' });
    if (reason === 'ime') capture.push({ kind: 'compositionstart', isComposing: true });
    if (reason === 'repeat') capture.push({ kind: 'keydown', key: 'c', repeat: true });
    if (reason === 'autofill') capture.push({ kind: 'input', value: 'abc', beforeValue: 'abc', inputType: 'insertReplacementText' });
    if (reason === 'interruption') capture.push({ kind: 'blur' });
    const result = analyzePhrase(exercise, capture.data(exercise));
    expect(result.metrics.finalAccuracy).toBe(1);
    expect(result.metrics.eligible).toBe(false);
    expect(result.metrics.correctCharactersPerMinute).toBeNull();
    expect(result.metrics.accuracyRecordEligible).toBe(false);
  });

  it('preserves aggregate counts and weights ratios by actual denominators', () => {
    const first = target('ab');
    const second = target('abcdef');
    const a = new Capture().insert('ax');
    const b = new Capture().insert('abcdef');
    const aggregate = aggregateMetrics([analyzePhrase(first, a.data(first)), analyzePhrase(second, b.data(second, { durationMs: 3000 }))]);
    expect(aggregate.finalAccuracy).toBe(7 / 8);
    expect(aggregate.matchedCharacters).toBe(7);
    expect(aggregate.correctCharactersPerMinute).toBe(105);
    expect(aggregateMetrics([])).toMatchObject({ finalAccuracy: null, coverage: 0, eligible: false, correctCharactersPerMinute: null });
  });

  it('rejects missing or inconsistent events and zero-duration speed records', () => {
    const exercise = target('abc');
    const capture = new Capture().insert('abc');
    expect(analyzePhrase(exercise, capture.data(exercise, { events: [] })).metrics).toMatchObject({ coverage: 0, eligible: false });
    expect(analyzePhrase(exercise, capture.data(exercise, { durationMs: 0 })).metrics.correctCharactersPerMinute).toBeNull();
    capture.events[5].beforeValue = 'wrong';
    expect(analyzePhrase(exercise, capture.data(exercise)).metrics.exclusions).toContain('incomplete-trace');
  });
});
