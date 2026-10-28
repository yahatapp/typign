import { acceptsPrefix, alignInput, alignPrefix, type InputAlignment } from './romanization';
import type { Exercise, InputEventRecord, Metrics, PatternObservation, PhraseCapture, PhraseResult } from './types';

export const MEASUREMENT_NOTES = [
  '正確性は許容経路への編集距離で計算します。文字の置換・挿入・脱落は各1、転置候補は別に数えます。',
  '誤り候補数は、編集で取り除かれた候補文字数と、最後に残った編集誤り数です。入力意図や原因の断定ではありません。',
  '修正操作は実際に文字を削除・置換した編集の回数です。正しい文字を消した場合も操作数に含みます。',
  '速度は修正を含む測定時間を使います。中断・IME・貼り付け・リピート等は精密比較から除きます。',
  'カバー率は入力履歴から内訳を判定できた文字の割合です。曖昧な編集の弱点への割当てを控えます。',
  '正確性の速度記録は、観測された誤り候補・修正操作がなく、全範囲を判定できた試行だけを候補にします。',
] as const;

interface CharacterToken { id: number; character: string; at: number | null; direct: boolean }
interface Edit { before: string; after: string; start: number; removed: string; inserted: string; ambiguous: boolean; tokensBefore: CharacterToken[]; tokensAfter: CharacterToken[] }
interface Replay {
  edits: Edit[]; tokens: CharacterToken[]; inserted: number; deleted: number;
  corrections: number; direct: number; unknown: number; exclusions: Set<string>; ambiguous: boolean;
}
interface Difference { start: number; removed: string; inserted: string; ambiguous: boolean }

function difference(before: string, after: string, prior: InputEventRecord | undefined, inputType: string): Difference {
  if (prior && Number.isInteger(prior.selectionStart) && Number.isInteger(prior.selectionEnd)) {
    let start = prior.selectionStart!;
    let end = prior.selectionEnd!;
    if (start === end && inputType === 'deleteContentBackward') start = Math.max(0, start - 1);
    if (start === end && inputType === 'deleteContentForward') end = Math.min(before.length, end + 1);
    const count = after.length - (before.length - (end - start));
    if (start >= 0 && end >= start && end <= before.length && count >= 0) {
      const inserted = after.slice(start, start + count);
      if (before.slice(0, start) + inserted + before.slice(end) === after) {
        return { start, removed: before.slice(start, end), inserted, ambiguous: false };
      }
    }
  }
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter--; }
  const removed = before.slice(start, endBefore);
  const inserted = after.slice(start, endAfter);
  let ambiguous = false;
  // Without a beforeinput selection, repeated characters can hide which token
  // was edited. Never fabricate its timing/provenance.
  if ((removed.length || inserted.length) && start > 0) {
    const shifted = before.slice(0, start - 1) + inserted + before.slice(start - 1 + removed.length);
    ambiguous = shifted === after;
  }
  return { start, removed, inserted, ambiguous };
}

function replay(capture: PhraseCapture): Replay {
  const result: Replay = { edits: [], tokens: [], inserted: 0, deleted: 0, corrections: 0, direct: 0, unknown: 0, exclusions: new Set(), ambiguous: false };
  let value = '';
  let nextToken = 0;
  let prior: InputEventRecord | undefined;
  let lastKey: InputEventRecord | undefined;
  let lastSeq = -1;
  let lastAt = -1;
  let composing = false;
  const unknownTokens = (text: string): CharacterToken[] => [...text].map((character) => ({ id: nextToken++, character, at: null, direct: false }));
  for (const event of capture.events) {
    if (!Number.isFinite(event.at) || event.at < 0 || event.at < lastAt || !Number.isInteger(event.seq) || event.seq <= lastSeq) result.exclusions.add('inconsistent-events');
    lastAt = event.at; lastSeq = event.seq;
    const kind = event.kind.toLowerCase();
    if (kind.startsWith('composition') || event.isComposing) result.exclusions.add('ime');
    if (kind === 'compositionstart') composing = true;
    if (kind === 'compositionend') composing = false;
    if (kind === 'paste') result.exclusions.add('paste');
    if (kind === 'drop') result.exclusions.add('drop');
    if (['blur', 'pause', 'visibility-hidden', 'hidden'].includes(kind)) result.exclusions.add('interrupted');
    if (event.repeat) result.exclusions.add('key-repeat');
    if (kind === 'keydown') { lastKey = event; continue; }
    if (kind === 'beforeinput') { prior = event; continue; }
    if (kind !== 'input' && kind !== 'edit') continue;
    if (typeof event.value !== 'string') { result.exclusions.add('inconsistent-events'); continue; }
    const before = event.beforeValue ?? prior?.beforeValue ?? prior?.value ?? value;
    if (before !== value) { result.exclusions.add('incomplete-trace'); result.tokens = unknownTokens(before); }
    const after = event.value;
    const inputType = event.inputType ?? prior?.inputType ?? '';
    const data = event.data ?? prior?.data;
    if (/paste/i.test(inputType)) result.exclusions.add('paste');
    if (/drop/i.test(inputType)) result.exclusions.add('drop');
    if (composing || /composition/i.test(inputType)) result.exclusions.add('ime');
    if (/replacement|yank/i.test(inputType) || (inputType === 'insertText' && typeof data === 'string' && data.length > 1)) result.exclusions.add('autofill-or-batched-input');
    if (/history/i.test(inputType)) result.exclusions.add('history-edit');
    if (!['insertText', 'deleteContentBackward', 'deleteContentForward', 'deleteByCut', 'deleteContent'].includes(inputType)) result.exclusions.add('unsupported-input');
    const change = difference(before, after, prior, inputType);
    const keyboard = lastKey && lastKey.key === change.inserted && change.inserted.length === 1 && !lastKey.repeat && !lastKey.isComposing && !lastKey.ctrlKey && !lastKey.metaKey && !lastKey.altKey;
    const direct = Boolean(keyboard && inputType === 'insertText' && !composing && /^[\x20-\x7e]$/u.test(change.inserted));
    const inserted = [...change.inserted].map((character): CharacterToken => ({ id: nextToken++, character, at: direct ? lastKey!.at : null, direct }));
    const tokensBefore = [...result.tokens];
    result.tokens.splice(change.start, change.removed.length, ...inserted);
    result.inserted += inserted.length;
    result.deleted += change.removed.length;
    if (change.removed.length) result.corrections++;
    if (direct) result.direct += inserted.length;
    if (change.ambiguous) { result.unknown += Math.max(change.removed.length, inserted.length); result.ambiguous = true; }
    if (change.removed.length || inserted.length) result.edits.push({ before, after, ...change, tokensBefore, tokensAfter: [...result.tokens] });
    value = after;
    prior = undefined; lastKey = undefined;
  }
  if (value !== capture.value) { result.exclusions.add('incomplete-trace'); result.tokens = unknownTokens(capture.value); }
  if (!result.edits.length && capture.value.length) result.exclusions.add('missing-input-events');
  if (result.inserted > result.direct) result.exclusions.add('keyboard-unobserved');
  if (capture.interrupted) result.exclusions.add('interrupted');
  if (!Number.isFinite(capture.durationMs) || capture.durationMs <= 0) result.exclusions.add('invalid-duration');
  return result;
}

interface SwapCandidate { key: string; path: string; positions: number[]; tokenIds: number[] }
function findSwap(exercise: Exercise, value: string, tokens: CharacterToken[]): SwapCandidate | undefined {
  if (acceptsPrefix(exercise, value)) return undefined;
  const possible: SwapCandidate[] = [];
  for (let i = 0; i + 1 < value.length; i++) {
    if (value[i] === value[i + 1]) continue;
    const swapped = value.slice(0, i) + value[i + 1] + value[i] + value.slice(i + 2);
    if (acceptsPrefix(exercise, swapped)) possible.push({ key: `${tokens[i]?.id ?? i}:${tokens[i + 1]?.id ?? i + 1}`, path: swapped, positions: [i, i + 1], tokenIds: [tokens[i]?.id ?? i, tokens[i + 1]?.id ?? i + 1] });
  }
  return possible.length === 1 ? possible[0] : undefined;
}

const affectedPositions = (alignment: InputAlignment): number[] => alignment.operations.filter((operation) => operation.kind !== 'match').map((operation) => Math.min(operation.expectedIndex, Math.max(0, alignment.path.length - 1)));
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export function analyzePhrase(exercise: Exercise, capture: PhraseCapture): PhraseResult {
  const trace = replay(capture);
  if (exercise.id !== capture.exerciseId || exercise.version !== capture.exerciseVersion) trace.exclusions.add('exercise-mismatch');
  let alignment: InputAlignment;
  try { alignment = alignInput(exercise, capture.value); }
  catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return {
      id: capture.id, exerciseId: capture.exerciseId, exerciseVersion: capture.exerciseVersion, mode: capture.mode, guide: capture.guide,
      finalValue: capture.value, acceptedPath: '', durationMs: capture.durationMs, patterns: [], ambiguous: true,
      metrics: { finalAccuracy: null, matchedCharacters: 0, remainingErrors: capture.value.length, insertedCharacters: trace.inserted,
        correctionOperations: trace.corrections, deletedCharacters: trace.deleted,
        correctionsPer100: trace.inserted ? 100 * trace.corrections / trace.inserted : null,
        correctCharactersPerMinute: null, coverage: 0, errorCandidates: 0, transpositionCandidates: 0,
        eligible: false, exclusions: [...trace.exclusions, 'input-too-long'], accuracyRecordEligible: false },
    };
  }
  const prefixCache = new Map<string, InputAlignment | null>();
  const prefix = (value: string): InputAlignment | null => {
    if (!prefixCache.has(value)) prefixCache.set(value, acceptsPrefix(exercise, value) ? null : alignPrefix(exercise, value));
    return prefixCache.get(value)!;
  };
  let corrected = 0;
  let unknown = trace.unknown;
  let ambiguous = trace.ambiguous;
  const affected: { path: string; positions: number[] }[] = [];
  const swaps = new Map<string, SwapCandidate>();
  const validDeletionStates = new Set<string>();
  for (const edit of trace.edits) {
    const swap = findSwap(exercise, edit.after, edit.tokensAfter);
    if (swap) swaps.set(swap.key, swap);
    const before = prefix(edit.before);
    if (!before && edit.removed.length) validDeletionStates.add(edit.after);
    if (!before || (!edit.removed.length && edit.start >= edit.before.length)) continue;
    const base = edit.removed.length ? edit.before.slice(0, edit.start) + edit.before.slice(edit.start + edit.removed.length) : edit.after;
    const knownSwaps = [...swaps.values()].filter((candidate) => edit.tokensBefore.slice(edit.start, edit.start + edit.removed.length).some((token) => candidate.tokenIds.includes(token.id)));
    const swappedIds = new Set(knownSwaps.flatMap((candidate) => candidate.tokenIds));
    const removedSwapCharacters = edit.tokensBefore.slice(edit.start, edit.start + edit.removed.length).filter((token) => swappedIds.has(token.id)).length;
    const afterDistance = prefix(edit.after)?.distance ?? 0;
    const reduction = validDeletionStates.has(edit.before) && !edit.removed.length ? 0 : Math.max(removedSwapCharacters, before.distance - Math.min(prefix(base)?.distance ?? 0, afterDistance), 0);
    if (!reduction) continue;
    corrected += reduction;
    const priorSwap = findSwap(exercise, edit.before, edit.tokensBefore);
    if (priorSwap) { swaps.set(priorSwap.key, priorSwap); affected.push(priorSwap); }
    else if (removedSwapCharacters) affected.push(...knownSwaps);
    else if (before.ambiguous || edit.ambiguous) { unknown += reduction; ambiguous = true; }
    else affected.push({ path: before.path, positions: affectedPositions(before) });
  }
  const finalSwap = findSwap(exercise, capture.value, trace.tokens);
  if (finalSwap) swaps.set(finalSwap.key, finalSwap);
  for (const swap of swaps.values()) affected.push(swap);
  if (alignment.ambiguous && !finalSwap) { unknown += alignment.distance; ambiguous = true; }
  else if (!alignment.ambiguous) affected.push({ path: alignment.path, positions: affectedPositions(alignment) });
  const totalInserted = Math.max(trace.inserted, capture.value.length);
  const unmeasured = ['ime', 'paste', 'drop', 'autofill-or-batched-input', 'unsupported-input', 'history-edit', 'incomplete-trace', 'missing-input-events', 'inconsistent-events', 'keyboard-unobserved'].some((reason) => trace.exclusions.has(reason));
  const coverage = totalInserted ? unmeasured ? 0 : clamp(1 - unknown / totalInserted) : 0;
  const eligible = trace.exclusions.size === 0;
  const finalAccuracy = alignment.path.length || capture.value.length ? clamp(1 - alignment.distance / Math.max(alignment.path.length, capture.value.length)) : null;
  const metrics: Metrics = {
    finalAccuracy, matchedCharacters: alignment.matchedCharacters, remainingErrors: alignment.distance,
    insertedCharacters: trace.inserted, correctionOperations: trace.corrections, deletedCharacters: trace.deleted,
    correctionsPer100: trace.inserted ? 100 * trace.corrections / trace.inserted : null,
    correctCharactersPerMinute: eligible ? alignment.matchedCharacters / (capture.durationMs / 60000) : null,
    coverage, errorCandidates: corrected + alignment.distance, transpositionCandidates: swaps.size,
    eligible, exclusions: [...trace.exclusions],
    accuracyRecordEligible: eligible && coverage === 1 && !ambiguous && finalAccuracy === 1 && corrected === 0 && trace.corrections === 0,
  };
  const knownPositions = new Set(affected.filter((item) => alignment.path.startsWith(item.path)).flatMap((item) => item.positions));
  const inputByExpected = new Map(alignment.operations.filter((operation) => operation.kind === 'match').map((operation) => [operation.expectedIndex, operation.inputIndex]));
  const patterns: PatternObservation[] = [];
  if (!unmeasured) for (const pattern of new Set(exercise.patterns)) {
    if (!pattern) continue;
    const observation: PatternObservation = { pattern, opportunities: 0, errorOpportunities: 0, samplesMs: [] };
    let start = alignment.path.indexOf(pattern);
    while (start >= 0) {
      const positions = Array.from({ length: pattern.length }, (_, index) => start + index);
      // Unknown attribution must not silently become a zero-error opportunity.
      if (!ambiguous || positions.some((position) => knownPositions.has(position))) {
        observation.opportunities++;
        const hasError = positions.some((position) => knownPositions.has(position));
        if (hasError) observation.errorOpportunities++;
        const tokens = positions.map((position) => trace.tokens[inputByExpected.get(position) ?? -1]);
        if (!hasError && eligible && !ambiguous && pattern.length >= 2 && pattern.length <= 3 && tokens.every((token) => token?.direct && token.at !== null) && tokens.every((token, index) => !index || token.id === tokens[index - 1].id + 1)) {
          const elapsed = tokens.at(-1)!.at! - tokens[0].at!;
          if (elapsed >= 0 && tokens.every((token, index) => !index || token.at! >= tokens[index - 1].at!)) observation.samplesMs.push(elapsed);
        }
      }
      start = alignment.path.indexOf(pattern, start + 1);
    }
    if (observation.opportunities) patterns.push(observation);
  }
  return {
    id: capture.id, exerciseId: capture.exerciseId, exerciseVersion: capture.exerciseVersion, mode: capture.mode, guide: capture.guide,
    finalValue: capture.value, acceptedPath: alignment.path, durationMs: capture.durationMs, metrics, patterns, ambiguous,
  };
}

/** Sums counts first; ratios are never unweighted averages of phrase scores. */
export function aggregateMetrics(phrases: PhraseResult[]): Metrics {
  const sum = (field: keyof Metrics): number => phrases.reduce((total, phrase) => total + (typeof phrase.metrics[field] === 'number' ? phrase.metrics[field] as number : 0), 0);
  const measured = phrases.filter((phrase) => phrase.metrics.finalAccuracy !== null);
  const denominator = measured.reduce((total, phrase) => total + Math.max(phrase.acceptedPath.length, phrase.finalValue.length), 0);
  const inserted = sum('insertedCharacters');
  const covered = phrases.reduce((total, phrase) => total + phrase.metrics.coverage * phrase.metrics.insertedCharacters, 0);
  const timed = phrases.filter((phrase) => phrase.metrics.eligible && phrase.durationMs > 0);
  const duration = timed.reduce((total, phrase) => total + phrase.durationMs, 0);
  const eligible = phrases.length > 0 && phrases.every((phrase) => phrase.metrics.eligible);
  const exclusions = [...new Set(phrases.flatMap((phrase) => phrase.metrics.exclusions))];
  return {
    finalAccuracy: denominator ? clamp(1 - measured.reduce((total, phrase) => total + phrase.metrics.remainingErrors, 0) / denominator) : null,
    matchedCharacters: sum('matchedCharacters'), remainingErrors: sum('remainingErrors'), insertedCharacters: inserted,
    correctionOperations: sum('correctionOperations'), deletedCharacters: sum('deletedCharacters'),
    correctionsPer100: inserted ? 100 * sum('correctionOperations') / inserted : null,
    correctCharactersPerMinute: duration ? timed.reduce((total, phrase) => total + phrase.metrics.matchedCharacters, 0) / (duration / 60000) : null,
    coverage: inserted ? clamp(covered / inserted) : 0, errorCandidates: sum('errorCandidates'), transpositionCandidates: sum('transpositionCandidates'),
    eligible, exclusions, accuracyRecordEligible: eligible && phrases.every((phrase) => phrase.metrics.accuracyRecordEligible),
  };
}
