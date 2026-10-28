import { describe, expect, it } from 'vitest';
import { accepts, acceptsPrefix, alignInput, buildInputGraph, defaultInput } from './romanization';
import type { Exercise, Segment } from './types';

const exercise = (text: string | Segment[]): Exercise => ({
  id: 'test', version: 1, display: '', reading: '', segments: typeof text === 'string' ? [{ type: 'kana', text }] : text,
  category: 'japanese', purpose: 'practice', difficulty: 1, patterns: [], modes: ['accuracy'],
});

describe('versioned allowed-path graph', () => {
  it('accepts equivalent romanizations without expanding complete paths', () => {
    const target = exercise('しちつじしゃちゅじょきゃ');
    expect(accepts(target, 'shichitsujishachu jokya'.replaceAll(' ', ''))).toBe(true);
    expect(accepts(target, 'sitituzisyatyuzyokya')).toBe(true);
    expect(accepts(target, 'sitituzisilyatilyuzilyokilya')).toBe(true);
    const long = exercise('し'.repeat(100));
    expect(buildInputGraph(long).nodes.length).toBeLessThan(1000);
    expect(accepts(long, 'si'.repeat(100))).toBe(true);
    expect(accepts(long, 'shi'.repeat(100))).toBe(true);
  });

  it('handles contextual n, explicit boundaries, and the n-column', () => {
    for (const value of ['kan', 'kann', "kan'"]) expect(accepts(exercise('かん'), value)).toBe(true);
    for (const value of ['kanni', "kan'i"]) expect(accepts(exercise('かんい'), value)).toBe(true);
    expect(accepts(exercise('かんい'), 'kani')).toBe(false);
    expect(accepts(exercise('みんな'), 'minna')).toBe(true);
    expect(accepts(exercise('こんにちは'), 'konnichiha')).toBe(true);
    expect(accepts(exercise('しんよう'), 'shinyou')).toBe(false);
    expect(accepts(exercise('しんよう'), "shin'you")).toBe(true);
    const mixed = exercise([{ type: 'kana', text: 'ん' }, { type: 'literal', text: 'api' }]);
    expect(accepts(mixed, "n'api")).toBe(true);
    expect(accepts(mixed, 'nnapi')).toBe(true);
    expect(accepts(mixed, 'napi')).toBe(false);
  });

  it('supports contracted and explicitly spelled small kana and sokuon', () => {
    for (const value of ['gakkou', 'gaxtukou', 'galtukou', 'gaxtsukou']) expect(accepts(exercise('がっこう'), value)).toBe(true);
    for (const value of ['maccha', 'matcha', 'mattya', 'maxtucha']) expect(accepts(exercise('まっちゃ'), value)).toBe(true);
    expect(accepts(exercise('まっちゃ'), 'mascha')).toBe(false);
    expect(accepts(exercise('うぃき'), 'wiki')).toBe(true);
    expect(accepts(exercise('ふぁいる'), 'fairu')).toBe(true);
  });

  it('respects literal uppercase, punctuation and segment boundaries', () => {
    const target = exercise([{ type: 'literal', text: 'API' }, { type: 'kana', text: 'のしよう' }, { type: 'literal', text: '()' }]);
    expect(defaultInput(target)).toBe('APInoshiyou()');
    expect(accepts(target, 'APInosiyou()')).toBe(true);
    expect(accepts(target, 'apinOSHIYOU()')).toBe(false);
    expect(acceptsPrefix(target, 'APInosh')).toBe(true);
    expect(acceptsPrefix(target, 'APInox')).toBe(false);
  });

  it('aligns against permitted paths and keeps ambiguous edits conservative', () => {
    expect(alignInput(exercise('し'), 'si')).toMatchObject({ distance: 0, path: 'si', matchedCharacters: 2, ambiguous: false });
    expect(alignInput(exercise([{ type: 'literal', text: 'ing' }]), 'ign')).toMatchObject({ distance: 2, ambiguous: true });
    expect(alignInput(exercise([{ type: 'literal', text: 'abc' }]), 'abx')).toMatchObject({ distance: 1, matchedCharacters: 2 });
    expect(() => buildInputGraph(exercise('漢'))).toThrow('未対応の読み');
  });
});
