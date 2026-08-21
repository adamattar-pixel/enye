/**
 * Comparaison de texte générique, tolérante aux accents espagnols et à
 * la ponctuation — extraite de `conjugation/validate.ts` pour être
 * réutilisée par la compréhension orale (dictée) plutôt que dupliquée,
 * voir docs/PLAN.md/docs/AUDIT.md, 20/08/2026.
 */

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Ponctuation à ignorer des deux côtés de la comparaison, y compris les
// signes espagnols ouvrants ¿¡ — nécessaire pour la compréhension orale
// (un utilisateur ne tape presque jamais la ponctuation exacte d'une
// dictée) ; sans impact sur la conjugaison, dont les réponses n'ont
// jamais de ponctuation dans leurs formes attendues.
const PUNCTUATION = /[¿¡.,;:!?()"'«»…\-–—]/g;

/** Normalise une chaîne pour comparaison : accents supprimés, casse
 * ignorée, ponctuation ignorée, espaces multiples réduits à un seul. */
export function normalizeAnswer(s: string): string {
  return stripAccents(s.toLowerCase())
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Correspondance exacte après normalisation — pas de tolérance au-delà
 * accents/ponctuation/casse/espaces : une réponse tronquée ou incomplète
 * reste incorrecte (voir les tests, cas donné explicitement dans la
 * mission compréhension orale). */
export function isExactMatch(typed: string, expected: string): boolean {
  return normalizeAnswer(typed) === normalizeAnswer(expected);
}
