import readingJson from '../data/reading.json';
import type { ReadingText } from './types';

/** Textes de compréhension écrite, importés une fois au chargement du
 * module — même principe que `conjugationVerbs`/`expressions` : le JSON
 * est la seule source de vérité pour le contenu, SQLite ne garde que la
 * progression SM-2 (voir `database.ts`, table `reading_cards`). */
export const readingTexts = readingJson as ReadingText[];

const readingTextById = new Map(readingTexts.map((t) => [t.id, t]));

export function getReadingText(id: string): ReadingText | undefined {
  return readingTextById.get(id);
}
