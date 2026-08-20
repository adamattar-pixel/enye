/** Une entrée de vocabulaire, telle que stockée dans words.json et dans
 * la table `words`. Voir WordList/words.sample.json pour le format
 * d'origine (36 mots, non encore validé à l'échelle de 1000-2000). */
export interface Word {
  id: string;
  spanish: string;
  french: string;
  partOfSpeech: string;
  gender: string | null;
  exampleEs: string;
  exampleFr: string;
  level: string;
  tags: string[];
  frequencyRank: number;
  /** Absent dans words.json (mots du bundle) ; `true` pour les mots
   * ajoutés par l'utilisateur depuis l'app (pas encore implémenté). */
  isUserAdded?: boolean;
}
