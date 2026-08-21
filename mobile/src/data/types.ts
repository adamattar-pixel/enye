/** Une entrée de vocabulaire, telle que stockée dans words.json et dans
 * la table `words`. Voir WordList/words.sample.json pour le format
 * d'origine (36 mots).
 *
 * Pivot du 20/08/2026 : le couple cible est espagnol→anglais, pas
 * espagnol→français (décision définitive, voir docs/PLAN.md/docs/AUDIT.md) —
 * `english`/`exampleEn` remplacent les anciens `french`/`exampleFr`. */
export interface Word {
  id: string;
  spanish: string;
  english: string;
  partOfSpeech: string;
  gender: string | null;
  exampleEs: string;
  exampleEn: string;
  level: string;
  tags: string[];
  frequencyRank: number;
  /** Absent dans words.json (mots du bundle) ; `true` pour les mots
   * ajoutés par l'utilisateur depuis l'app (pas encore implémenté). */
  isUserAdded?: boolean;
}
