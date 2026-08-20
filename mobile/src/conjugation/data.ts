import conjugationsJson from '../data/conjugations.json';
import type { ConjugationVerb } from './types';

/** Verbes + tableaux de conjugaison, importés une fois au chargement du
 * module — même principe que `words.json` pour le vocabulaire, mais
 * cette liste n'est PAS dupliquée en SQLite (voir database.ts) : c'est
 * ici la seule source de vérité pour le contenu (infinitif, glose,
 * formes), la base ne garde que la progression SM-2. */
export const conjugationVerbs = conjugationsJson as ConjugationVerb[];

const verbById = new Map(conjugationVerbs.map((v) => [v.id, v]));

export function getConjugationVerb(id: string): ConjugationVerb | undefined {
  return verbById.get(id);
}
