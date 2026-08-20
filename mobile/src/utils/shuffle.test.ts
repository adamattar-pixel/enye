import { shuffle } from './shuffle';

describe('shuffle', () => {
  test('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input);
    expect(input).toEqual(copy);
  });

  test('returns an array with the same elements', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  test('handles empty and single-element arrays', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([1])).toEqual([1]);
  });

  test('produces different orderings across many runs (statistical, not deterministic)', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const orderings = new Set<string>();
    for (let i = 0; i < 30; i++) {
      orderings.add(shuffle(input).join(','));
    }
    // Avec 20 éléments, la probabilité d'obtenir le même ordre deux fois
    // en 30 tirages est astronomiquement faible si le mélange fonctionne.
    expect(orderings.size).toBeGreaterThan(1);
  });
});
