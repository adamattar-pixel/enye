/** Une question de compréhension à choix multiple — `options` inclut la
 * bonne réponse, `correctIndex` pointe laquelle. Choix multiple plutôt
 * qu'une réponse ouverte, voir `mobile/scripts/generate-reading/README.md`
 * pour la justification (fiabilité de génération hors-ligne). */
export interface ReadingQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

/** Un mini-texte espagnol (2-3 phrases) avec ses 1-2 questions de
 * compréhension — voir `mobile/src/data/reading.json` et
 * `mobile/scripts/generate-reading/generate.mjs`. Une carte SM-2
 * correspond à un texte ENTIER avec toutes ses questions, pas à une
 * question individuelle (demandé explicitement le 21/08/2026). */
export interface ReadingText {
  id: string;
  spanish: string;
  theme: string;
  questions: ReadingQuestion[];
}
