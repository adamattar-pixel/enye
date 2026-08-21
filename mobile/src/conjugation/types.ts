/** Les 9 combinaisons temps/mode couvertes en v1 (voir docs/PLAN.md) —
 * indicatif (5), conditionnel (1), subjonctif (2), impératif (2). Les
 * clés correspondent exactement aux champs `forms` de
 * `mobile/src/data/conjugations.json` (voir
 * `mobile/scripts/generate-conjugations/generate.mjs`). */
export type ConjugationTense =
  | 'indicativePresent'
  | 'indicativePreterite'
  | 'indicativeImperfect'
  | 'indicativeFuture'
  | 'conditionalPresent'
  | 'subjunctivePresent'
  | 'subjunctiveImperfect'
  | 'imperativeAffirmative'
  | 'imperativeNegative';

export const CONJUGATION_TENSES: ConjugationTense[] = [
  'indicativePresent',
  'indicativePreterite',
  'indicativeImperfect',
  'indicativeFuture',
  'conditionalPresent',
  'subjunctivePresent',
  'subjunctiveImperfect',
  'imperativeAffirmative',
  'imperativeNegative',
];

/** Libellés français (terminologie de grammaire enseignée en France),
 * pas espagnols — cohérent avec le reste du chrome de l'app (écrans,
 * boutons) qui est en français, la matière apprise (les formes
 * elles-mêmes) restant en espagnol. */
export const TENSE_LABELS: Record<ConjugationTense, string> = {
  indicativePresent: 'Indicatif présent',
  indicativePreterite: 'Passé simple',
  indicativeImperfect: 'Imparfait',
  indicativeFuture: 'Futur',
  conditionalPresent: 'Conditionnel présent',
  subjunctivePresent: 'Subjonctif présent',
  subjunctiveImperfect: 'Subjonctif imparfait',
  imperativeAffirmative: 'Impératif affirmatif',
  imperativeNegative: 'Impératif négatif',
};

/** L'impératif n'a pas de forme "yo" (on ne se donne pas d'ordre à
 * soi-même) — 5 personnes au lieu de 6 pour ces deux temps. */
const IMPERATIVE_TENSES = new Set<ConjugationTense>(['imperativeAffirmative', 'imperativeNegative']);

export const PERSON_LABELS_6 = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];
export const PERSON_LABELS_5 = ['tú', 'usted', 'nosotros', 'vosotros', 'ustedes'];

export function personLabelsForTense(tense: ConjugationTense): string[] {
  return IMPERATIVE_TENSES.has(tense) ? PERSON_LABELS_5 : PERSON_LABELS_6;
}

export function personCountForTense(tense: ConjugationTense): number {
  return personLabelsForTense(tense).length;
}

/** Un verbe et son tableau de conjugaison complet — forme de
 * `conjugations.json`, importé tel quel (pas de re-parsing). */
export interface ConjugationVerb {
  id: string;
  infinitive: string;
  english: string;
  frequencyRank: number;
  forms: Record<ConjugationTense, string[]>;
}
