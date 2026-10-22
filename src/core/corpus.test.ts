import { describe, expect, it } from 'vitest';
import { EXERCISES } from './corpus';
import { accepts, defaultInput } from './romanization';

describe('authored corpus', () => {
  it('separates practice and unseen evaluations with unique versioned IDs', () => {
    expect(new Set(EXERCISES.map((exercise) => exercise.id)).size).toBe(EXERCISES.length);
    const practiceTexts = new Set(EXERCISES.filter((exercise) => exercise.purpose === 'practice').map((exercise) => exercise.display));
    for (const exercise of EXERCISES.filter((item) => item.purpose === 'evaluation')) expect(practiceTexts.has(exercise.display)).toBe(false);
    expect(EXERCISES.filter((exercise) => exercise.id.startsWith('phrase-')).length).toBeGreaterThanOrEqual(50);
    for (const category of ['japanese', 'mixed', 'english', 'symbols']) expect(EXERCISES.some((exercise) => exercise.purpose === 'evaluation' && exercise.category === category)).toBe(true);
  });
  it('contains only supported readings and pattern opportunities', () => {
    for (const exercise of EXERCISES) {
      const input = defaultInput(exercise);
      expect(exercise.version).toBe(1);
      expect(input.length).toBeGreaterThan(0);
      expect(accepts(exercise, input)).toBe(true);
      expect(exercise.reading).toBe(exercise.segments.map((segment) => segment.text).join(''));
      for (const pattern of exercise.patterns) expect(input.includes(pattern)).toBe(true);
    }
  });
});
