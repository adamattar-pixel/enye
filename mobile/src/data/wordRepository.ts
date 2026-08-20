import type { Word } from './types';

/** Valide et normalise le contenu brut de words.json — c'est la
 * frontière du système où une entrée malformée pourrait autrement
 * planter plus loin (SQLite, l'UI). Rejette silencieusement les entrées
 * invalides plutôt que de faire planter tout l'import (le contenu vient
 * d'un fichier qu'on contrôle, mais mieux vaut ne pas perdre 999 mots
 * valides à cause d'une virgule oubliée sur un seul). */
export function parseWords(raw: unknown): Word[] {
  if (!Array.isArray(raw)) {
    throw new Error('words.json doit contenir un tableau.');
  }

  const words: Word[] = [];
  for (const entry of raw) {
    const word = parseWordEntry(entry);
    if (word) words.push(word);
  }
  return words;
}

function parseWordEntry(entry: unknown): Word | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const e = entry as Record<string, unknown>;

  if (
    typeof e.id !== 'string' ||
    typeof e.spanish !== 'string' ||
    typeof e.english !== 'string' ||
    typeof e.partOfSpeech !== 'string' ||
    typeof e.exampleEs !== 'string' ||
    typeof e.exampleEn !== 'string' ||
    typeof e.level !== 'string' ||
    !Array.isArray(e.tags) ||
    typeof e.frequencyRank !== 'number'
  ) {
    return null;
  }

  return {
    id: e.id,
    spanish: e.spanish,
    english: e.english,
    partOfSpeech: e.partOfSpeech,
    gender: typeof e.gender === 'string' ? e.gender : null,
    exampleEs: e.exampleEs,
    exampleEn: e.exampleEn,
    level: e.level,
    tags: e.tags.filter((t): t is string => typeof t === 'string'),
    frequencyRank: e.frequencyRank,
  };
}

/** Détecte les doublons d'id — utile puisque l'id est la clé primaire
 * SQLite ; un doublon dans le JSON écraserait silencieusement une
 * entrée à l'import sinon. */
export function findDuplicateIds(words: Word[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const word of words) {
    if (seen.has(word.id)) duplicates.add(word.id);
    seen.add(word.id);
  }
  return [...duplicates];
}
