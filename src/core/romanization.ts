import type { Exercise, Segment } from './types';

/** Product-owned table, versioned by ROMANIZATION_VERSION; no external table is copied. */
export const ROMANIZATION_SUPPORT = [
  'ひらがな・カタカナの読み、基本的な拗音・外来音、shi/si・chi/ti・tsu/tu・ji/ziに対応します。',
  '小書き文字はx/l、促音は子音の重複またはxtu/ltu/xtsu/ltsuを使えます。',
  'んは末尾と子音の前でn/nn/n\'、母音・y・次の「ん」の前ではnn/n\'を使います。',
  '日本語の読みと英字は教材で区切ります。英字・大文字・記号は表示どおりに入力します。',
] as const;

const TABLE: Record<string, readonly string[]> = {
  あ: ['a'], い: ['i', 'yi'], う: ['u', 'wu', 'whu'], え: ['e'], お: ['o'],
  か: ['ka', 'ca'], き: ['ki'], く: ['ku', 'cu', 'qu'], け: ['ke'], こ: ['ko', 'co'],
  さ: ['sa'], し: ['shi', 'si', 'ci'], す: ['su'], せ: ['se', 'ce'], そ: ['so'],
  た: ['ta'], ち: ['chi', 'ti'], つ: ['tsu', 'tu'], て: ['te'], と: ['to'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['fu', 'hu'], へ: ['he'], ほ: ['ho'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], ゐ: ['wyi'], ゑ: ['wye'], を: ['wo'],
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  ざ: ['za'], じ: ['ji', 'zi'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  だ: ['da'], ぢ: ['di'], づ: ['du'], で: ['de'], ど: ['do'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],
  ぁ: ['xa', 'la'], ぃ: ['xi', 'li', 'xyi', 'lyi'], ぅ: ['xu', 'lu'],
  ぇ: ['xe', 'le', 'xye', 'lye'], ぉ: ['xo', 'lo'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'],
  ゎ: ['xwa', 'lwa'], ゕ: ['xka', 'lka'], ゖ: ['xke', 'lke'],
  ゔ: ['vu'], 'ー': ['-'],
  きゃ: ['kya'], きゅ: ['kyu'], きょ: ['kyo'], きぇ: ['kye'],
  ぎゃ: ['gya'], ぎゅ: ['gyu'], ぎょ: ['gyo'], ぎぇ: ['gye'],
  しゃ: ['sha', 'sya'], しゅ: ['shu', 'syu'], しょ: ['sho', 'syo'], しぇ: ['she', 'sye'],
  じゃ: ['ja', 'jya', 'zya'], じゅ: ['ju', 'jyu', 'zyu'], じょ: ['jo', 'jyo', 'zyo'], じぇ: ['je', 'jye', 'zye'],
  ちゃ: ['cha', 'tya', 'cya'], ちゅ: ['chu', 'tyu', 'cyu'], ちょ: ['cho', 'tyo', 'cyo'], ちぇ: ['che', 'tye', 'cye'],
  ぢゃ: ['dya'], ぢゅ: ['dyu'], ぢょ: ['dyo'], ぢぇ: ['dye'],
  にゃ: ['nya'], にゅ: ['nyu'], にょ: ['nyo'], にぇ: ['nye'],
  ひゃ: ['hya'], ひゅ: ['hyu'], ひょ: ['hyo'], ひぇ: ['hye'],
  びゃ: ['bya'], びゅ: ['byu'], びょ: ['byo'], びぇ: ['bye'],
  ぴゃ: ['pya'], ぴゅ: ['pyu'], ぴょ: ['pyo'], ぴぇ: ['pye'],
  みゃ: ['mya'], みゅ: ['myu'], みょ: ['myo'], みぇ: ['mye'],
  りゃ: ['rya'], りゅ: ['ryu'], りょ: ['ryo'], りぇ: ['rye'],
  いぇ: ['ye'], うぁ: ['wha'], うぃ: ['wi', 'whi'], うぇ: ['we', 'whe'], うぉ: ['who'],
  くぁ: ['kwa', 'qa'], くぃ: ['kwi', 'qi', 'qyi'], くぅ: ['kwu', 'qwu'],
  くぇ: ['kwe', 'qe', 'qye'], くぉ: ['kwo', 'qo'],
  ぐぁ: ['gwa'], ぐぃ: ['gwi'], ぐぇ: ['gwe'], ぐぉ: ['gwo'],
  すぁ: ['swa'], すぃ: ['swi'], すぅ: ['swu'], すぇ: ['swe'], すぉ: ['swo'],
  つぁ: ['tsa'], つぃ: ['tsi'], つぇ: ['tse'], つぉ: ['tso'],
  てゃ: ['tha'], てぃ: ['thi'], てゅ: ['thu'], てぇ: ['the'], てょ: ['tho'],
  でゃ: ['dha'], でぃ: ['dhi'], でゅ: ['dhu'], でぇ: ['dhe'], でょ: ['dho'],
  とぁ: ['twa'], とぃ: ['twi'], とぅ: ['twu'], とぇ: ['twe'], とぉ: ['two'],
  どぁ: ['dwa'], どぃ: ['dwi'], どぅ: ['dwu'], どぇ: ['dwe'], どぉ: ['dwo'],
  ふぁ: ['fa', 'fwa'], ふぃ: ['fi', 'fyi', 'fwi'], ふぇ: ['fe', 'fwe'], ふぉ: ['fo', 'fwo'],
  ふゃ: ['fya'], ふゅ: ['fyu'], ふょ: ['fyo'],
  ゔぁ: ['va'], ゔぃ: ['vi', 'vyi'], ゔぇ: ['ve'], ゔぉ: ['vo'],
  ゔゃ: ['vya'], ゔゅ: ['vyu'], ゔょ: ['vyo'],
};

export interface GraphEdge { character: string; to: number }
export interface InputGraph { nodes: { edges: GraphEdge[] }[]; start: number; end: number; order: number[] }
export interface AlignmentOperation {
  kind: 'match' | 'substitution' | 'insertion' | 'deletion';
  expected: string; actual: string; expectedIndex: number; inputIndex: number;
}
export interface InputAlignment {
  path: string; distance: number; matchedCharacters: number;
  operations: AlignmentOperation[]; ambiguous: boolean;
}

const cached = new WeakMap<Exercise, InputGraph>();
const kanaText = (value: string): string => value.replace(/[ァ-ヶ]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));

function followingText(segments: Segment[], index: number): string {
  return segments.slice(index + 1).find((segment) => segment.text.length)?.text ?? '';
}

function rulesAt(text: string, index: number, nextSegment: string): { length: number; forms: readonly string[] }[] {
  const char = text[index];
  if (char === 'ん') {
    const next = text[index + 1] ?? nextSegment[0] ?? '';
    // A bare n before a vowel/y would be parsed as another kana. The n-column
    // is different: minna/konnichiha are legitimate contextual spellings.
    const requiresBoundary = /^[あいうえおぁぃぅぇぉやゆよゃゅょんaiueoyn]$/u.test(next);
    return [{ length: 1, forms: requiresBoundary ? ['nn', "n'"] : ['n', 'nn', "n'"] }];
  }
  if (char === 'っ') {
    const nextRules = index + 1 < text.length ? rulesAt(text, index + 1, nextSegment) : [];
    const doubled = nextRules.flatMap((rule) => rule.forms.flatMap((form) => {
      if (!/^[bcdfghjklmpqrstvwxyz]/u.test(form) || /^[xl]/u.test(form)) return [];
      const forms = [form[0] + form];
      if (form.startsWith('ch')) forms.push('t' + form);
      return forms.map((item) => ({ length: rule.length + 1, forms: [item] }));
    }));
    return [...doubled, { length: 1, forms: ['xtu', 'ltu', 'xtsu', 'ltsu'] }];
  }
  const rules: { length: number; forms: readonly string[] }[] = [];
  const compound = TABLE[text.slice(index, index + 2)];
  if (compound && index + 1 < text.length) rules.push({ length: 2, forms: compound });
  if (TABLE[char]) rules.push({ length: 1, forms: TABLE[char] });
  if (!rules.length) throw new Error(`未対応の読み: ${char}。英字・記号はliteral区間で指定してください。`);
  return rules;
}

/** A DAG of character transitions. Branching is per kana, never complete strings. */
export function buildInputGraph(exercise: Exercise): InputGraph {
  const existing = cached.get(exercise);
  if (existing) return existing;
  const graph: InputGraph = { nodes: [{ edges: [] }], start: 0, end: 0, order: [] };
  const node = (): number => { graph.nodes.push({ edges: [] }); return graph.nodes.length - 1; };
  const word = (from: number, to: number, value: string): void => {
    let current = from;
    for (let i = 0; i < value.length; i++) {
      const next = i === value.length - 1 ? to : node();
      if (!graph.nodes[current].edges.some((edge) => edge.character === value[i] && edge.to === next)) {
        graph.nodes[current].edges.push({ character: value[i], to: next });
      }
      current = next;
    }
  };
  exercise.segments.forEach((segment, segmentIndex) => {
    const text = segment.type === 'kana' ? kanaText(segment.text) : segment.text;
    const positions = [graph.end, ...Array.from({ length: text.length }, node)];
    for (let i = 0; i < text.length; i++) {
      if (segment.type === 'literal') word(positions[i], positions[i + 1], text[i]);
      else for (const rule of rulesAt(text, i, kanaText(followingText(exercise.segments, segmentIndex)))) {
        for (const form of rule.forms) word(positions[i], positions[i + rule.length], form);
      }
    }
    graph.end = positions[text.length];
  });
  const visited = new Set<number>();
  const visit = (current: number): void => {
    if (visited.has(current)) return;
    visited.add(current);
    for (const edge of graph.nodes[current].edges) visit(edge.to);
    graph.order.unshift(current);
  };
  visit(graph.start);
  cached.set(exercise, graph);
  return graph;
}

function advance(graph: InputGraph, value: string): Set<number> {
  let current = new Set([graph.start]);
  for (const character of value) {
    const next = new Set<number>();
    for (const id of current) for (const edge of graph.nodes[id].edges) if (edge.character === character) next.add(edge.to);
    current = next;
    if (!current.size) break;
  }
  return current;
}

export function accepts(exercise: Exercise, value: string): boolean {
  return advance(buildInputGraph(exercise), value).has(buildInputGraph(exercise).end);
}

export function acceptsPrefix(exercise: Exercise, value: string): boolean {
  return advance(buildInputGraph(exercise), value).size > 0;
}

export function defaultInput(exercise: Exercise): string {
  const graph = buildInputGraph(exercise);
  let current = graph.start;
  let value = '';
  while (current !== graph.end) {
    const edge = graph.nodes[current].edges[0];
    if (!edge) throw new Error('入力経路のない教材です。');
    value += edge.character;
    current = edge.to;
  }
  return value;
}

function calculateAlignment(graph: InputGraph, value: string, prefix: boolean, lengthWeight: number): InputAlignment {
  const width = value.length + 1;
  const size = width * graph.nodes.length;
  if (value.length > 2048 || size > 3_000_000) throw new RangeError('精密計測の入力上限を超えました。');
  const costs = new Float64Array(size).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(size).fill(-1);
  const edgeIndices = new Uint16Array(size);
  const ways = new Uint8Array(size);
  costs[graph.start * width] = 0;
  ways[graph.start * width] = 1;
  const update = (target: number, source: number, cost: number, edgeIndex: number): void => {
    if (cost < costs[target] - 1e-9) {
      costs[target] = cost; previous[target] = source; edgeIndices[target] = edgeIndex; ways[target] = ways[source];
    } else if (Math.abs(cost - costs[target]) < 1e-9) ways[target] = Math.min(2, ways[target] + ways[source]);
  };
  for (const id of graph.order) for (let j = 0; j < width; j++) {
    const source = id * width + j;
    if (!Number.isFinite(costs[source])) continue;
    if (j < value.length) update(source + 1, source, costs[source] + 1, 0);
    graph.nodes[id].edges.forEach((edge, index) => {
      update(edge.to * width + j, source, costs[source] + 1 - lengthWeight, index + 1);
      if (j < value.length) update(edge.to * width + j + 1, source, costs[source] + (edge.character === value[j] ? 0 : 1) - lengthWeight, index + 1);
    });
  }
  let terminal = graph.end * width + value.length;
  if (prefix) {
    // Prefer the shortest endpoint on ties, but retain ambiguity for attribution.
    terminal = graph.start * width + value.length;
    for (const id of graph.order) {
      const candidate = id * width + value.length;
      if (costs[candidate] < costs[terminal] - 1e-9) terminal = candidate;
      else if (candidate !== terminal && Math.abs(costs[candidate] - costs[terminal]) < 1e-9) ways[terminal] = 2;
    }
  }
  const reverse: Omit<AlignmentOperation, 'expectedIndex'>[] = [];
  let current = terminal;
  while (previous[current] >= 0) {
    const source = previous[current];
    const from = Math.floor(source / width);
    const j = source % width;
    const edgeIndex = edgeIndices[current];
    if (edgeIndex === 0) reverse.push({ kind: 'insertion', expected: '', actual: value[j], inputIndex: j });
    else {
      const expected = graph.nodes[from].edges[edgeIndex - 1].character;
      const consumes = current % width !== j;
      reverse.push({ kind: !consumes ? 'deletion' : expected === value[j] ? 'match' : 'substitution', expected, actual: consumes ? value[j] : '', inputIndex: j });
    }
    current = source;
  }
  let expectedIndex = 0;
  const operations = reverse.reverse().map((operation): AlignmentOperation => {
    const indexed = { ...operation, expectedIndex };
    if (operation.expected) expectedIndex++;
    return indexed;
  });
  const distance = operations.filter((operation) => operation.kind !== 'match').length;
  return {
    path: operations.map((operation) => operation.expected).join(''), distance,
    matchedCharacters: operations.filter((operation) => operation.kind === 'match').length,
    operations, ambiguous: distance > 0 && ways[terminal] > 1,
  };
}

/** Aligns to any valid prefix, so an unfinished suffix is never an error. */
export function alignPrefix(exercise: Exercise, value: string): InputAlignment {
  return calculateAlignment(buildInputGraph(exercise), value, true, 0);
}

/** Maximise 1 - D/max(path length, input length), without enumerating paths. */
export function alignInput(exercise: Exercise, value: string): InputAlignment {
  const graph = buildInputGraph(exercise);
  let best = calculateAlignment(graph, value, false, 0);
  if (best.distance === 0 || !best.path.length) return best;
  const ratio = (alignment: InputAlignment): number => alignment.distance / Math.max(alignment.path.length, value.length, 1);
  let weight = best.distance / best.path.length;
  // Fractional shortest-path optimisation. Each pass is a DAG dynamic program;
  // the extra min-distance candidate also covers paths shorter than the input.
  for (let i = 0; i < 16; i++) {
    const candidate = calculateAlignment(graph, value, false, weight);
    if (ratio(candidate) < ratio(best) - 1e-9) best = candidate;
    const next = candidate.distance / candidate.path.length;
    if (!Number.isFinite(next) || next >= weight - 1e-9) break;
    weight = next;
  }
  return best;
}
