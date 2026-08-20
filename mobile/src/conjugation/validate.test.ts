import { isCorrectAnswer } from './validate';

describe('isCorrectAnswer', () => {
  test('accepts an exact match', () => {
    expect(isCorrectAnswer('habló', 'habló', 'indicativePreterite', 2)).toBe(true);
  });

  test('is tolerant on missing accents', () => {
    expect(isCorrectAnswer('hablo', 'habló', 'indicativePreterite', 2)).toBe(true);
    expect(isCorrectAnswer('penso', 'pensó', 'indicativePreterite', 2)).toBe(true);
  });

  test('is tolerant on extra/wrong accents', () => {
    expect(isCorrectAnswer('háblo', 'hablo', 'indicativePresent', 0)).toBe(true);
  });

  test('ignores surrounding whitespace and case', () => {
    expect(isCorrectAnswer('  HABLO  ', 'hablo', 'indicativePresent', 0)).toBe(true);
  });

  test('rejects a genuinely wrong form', () => {
    expect(isCorrectAnswer('hablas', 'hablo', 'indicativePresent', 0)).toBe(false);
    expect(isCorrectAnswer('', 'hablo', 'indicativePresent', 0)).toBe(false);
  });

  test('accepts the -se variant of the imperfect subjunctive, derived from the -ra form', () => {
    expect(isCorrectAnswer('hablase', 'hablara', 'subjunctiveImperfect', 0)).toBe(true);
    expect(isCorrectAnswer('hablases', 'hablaras', 'subjunctiveImperfect', 1)).toBe(true);
    expect(isCorrectAnswer('hablásemos', 'habláramos', 'subjunctiveImperfect', 3)).toBe(true);
    expect(isCorrectAnswer('hablaseis', 'hablarais', 'subjunctiveImperfect', 4)).toBe(true);
    expect(isCorrectAnswer('hablasen', 'hablaran', 'subjunctiveImperfect', 5)).toBe(true);
  });

  test('does not accept an unrelated -se-like form for the imperfect subjunctive', () => {
    expect(isCorrectAnswer('comiese', 'hablara', 'subjunctiveImperfect', 0)).toBe(false);
  });

  test('does not apply the -ra/-se swap outside the imperfect subjunctive', () => {
    expect(isCorrectAnswer('hablase', 'hablara', 'indicativePresent', 0)).toBe(false);
  });
});
