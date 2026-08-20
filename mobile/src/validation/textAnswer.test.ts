import { isExactMatch, normalizeAnswer } from './textAnswer';

describe('isExactMatch', () => {
  test('accepts an exact match', () => {
    expect(isExactMatch('habló', 'habló')).toBe(true);
  });

  test('is tolerant on missing/extra accents', () => {
    expect(isExactMatch('hablo', 'habló')).toBe(true);
    expect(isExactMatch('háblo', 'hablo')).toBe(true);
  });

  test('ignores case and surrounding whitespace', () => {
    expect(isExactMatch('  HABLO  ', 'hablo')).toBe(true);
  });

  // Exemple donné explicitement dans la mission compréhension orale.
  test('the exact example from the mission: missing final period is tolerated', () => {
    expect(isExactMatch('No se lo que quieres decir', 'No sé lo que quieres decir.')).toBe(true);
  });

  test('ignores punctuation including opening Spanish marks', () => {
    expect(isExactMatch('Que haces aqui', '¿Qué haces aquí?')).toBe(true);
    expect(isExactMatch('Que sorpresa', '¡Qué sorpresa!')).toBe(true);
  });

  test('a truncated/incomplete answer is still rejected', () => {
    expect(isExactMatch('No se lo que quieres', 'No sé lo que quieres decir.')).toBe(false);
  });

  test('rejects a genuinely different answer', () => {
    expect(isExactMatch('Estoy esperando a mi hermano.', 'No sabía que ibas a venir.')).toBe(false);
  });
});

describe('normalizeAnswer', () => {
  test('collapses multiple spaces', () => {
    expect(normalizeAnswer('hola   que   tal')).toBe('hola que tal');
  });
});
