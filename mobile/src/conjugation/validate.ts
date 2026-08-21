import type { ConjugationTense } from './types';
import { normalizeAnswer as normalize } from '../validation/textAnswer';

// La normalisation (accents/casse/ponctuation/espaces) vit désormais
// dans `validation/textAnswer.ts`, partagée avec la compréhension orale
// (20/08/2026) — voir docs/PLAN.md/docs/AUDIT.md. Réexportée ici sous son ancien
// nom local pour ne changer aucune ligne plus bas dans ce fichier.

/** Suffixes de la 6ème position (personIndex 0-5) du subjonctif
 * imparfait en -ra vers son équivalent en -se — le radical est
 * identique entre les deux formes, seul le suffixe change. Utilisé
 * pour accepter les deux formes sans avoir à stocker la variante -se
 * séparément dans `conjugations.json` (voir son README). */
const RA_TO_SE_SUFFIX: readonly [string, string][] = [
  ['ra', 'se'],
  ['ras', 'ses'],
  ['ra', 'se'],
  ['ramos', 'semos'],
  ['rais', 'seis'],
  ['ran', 'sen'],
];

function deriveSeVariant(raForm: string, personIndex: number): string | null {
  const pair = RA_TO_SE_SUFFIX[personIndex];
  if (!pair) return null;
  const [from, to] = pair;
  return raForm.endsWith(from) ? raForm.slice(0, -from.length) + to : null;
}

/**
 * Compare la réponse tapée à la forme attendue. **Tolérant sur les
 * accents** (ignorés des deux côtés de la comparaison, ex. "hablo"
 * accepté pour "habló") — décision documentée dans docs/AUDIT.md : la plus
 * indulgente des trois options envisagées, pour ne jamais décourager
 * sur un accent manquant plutôt qu'une vraie erreur de conjugaison.
 * Correctible plus tard vers une règle plus stricte si l'usage montre
 * que c'est trop permissif.
 *
 * Au subjonctif imparfait, accepte aussi la variante en -se (dérivée de
 * la forme en -ra fournie), tout aussi correcte en espagnol.
 */
export function isCorrectAnswer(typed: string, expected: string, tense: ConjugationTense, personIndex: number): boolean {
  const normalizedTyped = normalize(typed);
  if (normalizedTyped === normalize(expected)) return true;

  if (tense === 'subjunctiveImperfect') {
    const seVariant = deriveSeVariant(expected, personIndex);
    if (seVariant && normalizedTyped === normalize(seVariant)) return true;
  }

  return false;
}
