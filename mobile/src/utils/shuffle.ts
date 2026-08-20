/** Mélange de Fisher-Yates — ne modifie pas le tableau reçu, en renvoie
 * une copie mélangée. Utilisé pour l'ordre de présentation des cartes de
 * conjugaison dues (voir `getDueConjugationCardsSplit`), suite à un
 * retour explicite : l'ordre d'insertion (verbe par verbe, temps par
 * temps) rendait l'entraînement trop prévisible. */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
