import type { Evidence, PhraseResult, Session } from '../core/types';

/** Conditions are deliberately conservative: different text/paths never share a comparison. */
export function phraseConditionsKey(session: Session, phrase: PhraseResult): string {
  return JSON.stringify({
    ...session.conditions, mode: phrase.mode, guide: phrase.guide,
    exerciseId: phrase.exerciseId, exerciseVersion: phrase.exerciseVersion,
    acceptedPath: phrase.acceptedPath,
  });
}

function hash(value: string): string {
  return [2166136261, 3339675911, 2246822519, 3266489917].map((seed) => {
    let result = seed;
    for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return (result >>> 0).toString(36);
  }).join('-');
}

export function buildEvidence(sessions: Session[]): Evidence[] {
  const groups = new Map<string, {
    pattern: string; conditionsKey: string; from: string; to: string;
    opportunities: number; errors: number; sessions: Set<string>; errorSessions: Set<string>; samples: number[];
  }>();
  for (const session of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))) {
    if (session.status !== 'completed') continue;
    for (const phrase of session.phrases) {
      if (!phrase.metrics.eligible || phrase.ambiguous) continue;
      const conditionsKey = phraseConditionsKey(session, phrase);
      for (const observation of phrase.patterns) {
        if (!observation.pattern || !Number.isInteger(observation.opportunities) || observation.opportunities <= 0
          || !Number.isInteger(observation.errorOpportunities) || observation.errorOpportunities < 0
          || observation.errorOpportunities > observation.opportunities) continue;
        const key = JSON.stringify([conditionsKey, observation.pattern]);
        const group = groups.get(key) ?? {
          pattern: observation.pattern, conditionsKey, from: session.startedAt,
          to: session.endedAt ?? session.startedAt, opportunities: 0, errors: 0,
          sessions: new Set<string>(), errorSessions: new Set<string>(), samples: [],
        };
        group.opportunities += observation.opportunities;
        group.errors += observation.errorOpportunities;
        group.sessions.add(session.id);
        if (observation.errorOpportunities > 0) group.errorSessions.add(session.id);
        const end = session.endedAt ?? session.startedAt;
        if (end > group.to) group.to = end;
        if (phrase.metrics.remainingErrors === 0 && phrase.metrics.correctionOperations === 0) {
          group.samples.push(...observation.samplesMs.filter((n) => Number.isFinite(n) && n > 0));
        }
        groups.set(key, group);
      }
    }
  }
  return [...groups.values()].map((g): Evidence => {
    const sessionIds = [...g.sessions].sort();
    const sorted = g.samples.sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const medianMs = sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
    return {
      id: `e-${hash(JSON.stringify([g.conditionsKey, g.pattern, sessionIds, g.opportunities, g.errors, g.from, g.to, sorted, g.errorSessions.size]))}`,
      pattern: g.pattern, from: g.from, to: g.to, conditionsKey: g.conditionsKey,
      opportunities: g.opportunities, errorOpportunities: g.errors, sessionIds,
      provisional: g.opportunities < 30 || g.errors < 3 || g.errorSessions.size < 2, medianMs,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function getPatternEvidence(evidence: Evidence[], pattern?: string, conditionsKey?: string): Evidence[] {
  return evidence.filter((item) => (!pattern || item.pattern === pattern)
    && (!conditionsKey || item.conditionsKey === conditionsKey)).map((item) => ({ ...item, sessionIds: [...item.sessionIds] }));
}

export function compareConditions(sessions: Session[], firstSessionIds: string[], secondSessionIds: string[]) {
  const resolve = (ids: string[]) => {
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error('比較するセッションを重複なく指定してください。');
    return ids.map((id) => {
      const session = sessions.find((item) => item.id === id);
      if (!session || session.status !== 'completed' || !session.phrases.length
        || session.phrases.some((p) => !p.metrics.eligible || p.ambiguous || p.durationMs <= 0)) {
        throw new Error('比較できないセッションが含まれています。');
      }
      return session;
    });
  };
  if (firstSessionIds.some((id) => secondSessionIds.includes(id))) {
    return { comparable: false as const, reason: '同じセッションを両方の期間には使えません。' };
  }
  const first = resolve(firstSessionIds);
  const second = resolve(secondSessionIds);
  const signature = (session: Session) => JSON.stringify(session.phrases.map((p) => phraseConditionsKey(session, p)).sort());
  const signatures = new Set([...first, ...second].map(signature));
  if (signatures.size !== 1) return {
    comparable: false as const,
    reason: '入力方式・配列・教材・表記経路・練習の種類・ガイド・計測環境が揃っていません。',
  };
  const aggregate = (items: Session[]) => {
    const phrases = items.flatMap((s) => s.phrases);
    const durationMs = phrases.reduce((sum, p) => sum + p.durationMs, 0);
    const matchedCharacters = phrases.reduce((sum, p) => sum + p.metrics.matchedCharacters, 0);
    const insertedCharacters = phrases.reduce((sum, p) => sum + p.metrics.insertedCharacters, 0);
    const correctionOperations = phrases.reduce((sum, p) => sum + p.metrics.correctionOperations, 0);
    return { sessionIds: items.map((s) => s.id), durationMs, matchedCharacters, insertedCharacters, correctionOperations,
      correctCharactersPerMinute: 60000 * matchedCharacters / durationMs,
      correctionsPer100: insertedCharacters ? 100 * correctionOperations / insertedCharacters : null };
  };
  return { comparable: true as const, first: aggregate(first), second: aggregate(second),
    caveat: '同条件の観測比較です。練習による効果や原因は、この比較だけでは確定できません。' };
}

export function getRetentionChecks(sessions: Session[], now = new Date()) {
  const result = new Map<string, { pattern: string; conditionsKey: string; practicedAt: string; sessionId: string; due: boolean }>();
  for (const session of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    if (session.status !== 'completed') continue;
    for (const phrase of session.phrases) {
      if (!phrase.metrics.eligible || phrase.ambiguous) continue;
      for (const observation of phrase.patterns) {
        const conditionsKey = JSON.stringify(session.conditions);
        const key = JSON.stringify([conditionsKey, observation.pattern]);
        if (phrase.mode === 'weakness' || phrase.mode === 'new-pattern') {
          result.set(key, { pattern: observation.pattern, conditionsKey, practicedAt: session.startedAt,
            sessionId: session.id, due: now.getTime() - Date.parse(session.startedAt) >= 86400000 });
        } else if (phrase.mode === 'evaluation') {
          const previous = result.get(key);
          if (previous && Date.parse(session.startedAt) - Date.parse(previous.practicedAt) >= 86400000) result.delete(key);
        }
      }
    }
  }
  return [...result.values()];
}
