import { parseWords, findDuplicateIds } from './wordRepository';
import wordsJson from './words.json';

describe('parseWords', () => {
  test('parses the real bundled words.json without dropping entries', () => {
    const words = parseWords(wordsJson);
    expect(words).toHaveLength((wordsJson as unknown[]).length);
  });

  test('every parsed word has the expected shape', () => {
    const words = parseWords(wordsJson);
    for (const word of words) {
      expect(typeof word.id).toBe('string');
      expect(typeof word.spanish).toBe('string');
      expect(typeof word.french).toBe('string');
      expect(typeof word.partOfSpeech).toBe('string');
      expect(word.gender === null || typeof word.gender === 'string').toBe(true);
      expect(typeof word.exampleEs).toBe('string');
      expect(typeof word.exampleFr).toBe('string');
      expect(typeof word.level).toBe('string');
      expect(Array.isArray(word.tags)).toBe(true);
      expect(typeof word.frequencyRank).toBe('number');
    }
  });

  test('the bundled words.json has no duplicate ids', () => {
    const words = parseWords(wordsJson);
    expect(findDuplicateIds(words)).toEqual([]);
  });

  test('throws if the top-level value is not an array', () => {
    expect(() => parseWords({ not: 'an array' })).toThrow();
  });

  test('silently drops malformed entries instead of failing the whole import', () => {
    const raw = [
      { id: 'casa', spanish: 'casa', french: 'maison', partOfSpeech: 'nom', gender: 'féminin', exampleEs: 'x', exampleFr: 'y', level: 'A1', tags: [], frequencyRank: 1 },
      { id: 'broken', spanish: 'roto' }, // missing required fields
      'not even an object',
      null,
    ];
    const words = parseWords(raw);
    expect(words).toHaveLength(1);
    expect(words[0].id).toBe('casa');
  });

  test('defaults gender to null when absent or not a string', () => {
    const raw = [
      { id: 'correr', spanish: 'correr', french: 'courir', partOfSpeech: 'verbe', exampleEs: 'x', exampleFr: 'y', level: 'A1', tags: [], frequencyRank: 1 },
    ];
    const words = parseWords(raw);
    expect(words[0].gender).toBeNull();
  });
});

describe('findDuplicateIds', () => {
  test('returns ids that appear more than once', () => {
    const words = [
      { id: 'a', spanish: '', french: '', partOfSpeech: '', gender: null, exampleEs: '', exampleFr: '', level: '', tags: [], frequencyRank: 0 },
      { id: 'b', spanish: '', french: '', partOfSpeech: '', gender: null, exampleEs: '', exampleFr: '', level: '', tags: [], frequencyRank: 0 },
      { id: 'a', spanish: '', french: '', partOfSpeech: '', gender: null, exampleEs: '', exampleFr: '', level: '', tags: [], frequencyRank: 0 },
    ];
    expect(findDuplicateIds(words)).toEqual(['a']);
  });

  test('returns an empty array when there are no duplicates', () => {
    const words = [
      { id: 'a', spanish: '', french: '', partOfSpeech: '', gender: null, exampleEs: '', exampleFr: '', level: '', tags: [], frequencyRank: 0 },
    ];
    expect(findDuplicateIds(words)).toEqual([]);
  });
});
