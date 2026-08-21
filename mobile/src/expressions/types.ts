/** Une expression ou locution espagnole, telle que générée dans
 * `mobile/src/data/expressions.json` — voir
 * `mobile/scripts/generate-expressions/generate.mjs`. Contenu propre à ce
 * domaine, distinct des phrases d'exemple de `words.json` (demandé
 * explicitement le 21/08/2026). */
export interface Expression {
  id: string;
  spanish: string;
  english: string;
  exampleEs: string;
  exampleEn: string;
  theme: string;
}
