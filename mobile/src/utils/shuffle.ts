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

/** Poids appliqué aux éléments prioritaires dans [pickWeighted] — demandé
 * explicitement (11/09/2026) : favoriser les nouvelles cartes par rapport
 * aux cartes déjà vues, en vocabulaire comme en conjugaison, sans pour
 * autant les exclure (toujours un tirage, pas un ordre figé "nouvelles
 * d'abord"). Valeur choisie arbitrairement (3x plus de chances qu'une
 * carte de révision) — à ajuster si jugé trop fort/faible à l'usage. */
export const NEW_CARD_WEIGHT = 3;

/** Tire un élément au hasard dans `items`, en comptant chaque élément
 * prioritaire (`isPriority` vrai) `weight` fois dans le tirage plutôt
 * qu'une seule — n'exclut ni ne réordonne `items` lui-même (utilisé
 * ailleurs pour un compte exact, ex. "X cartes dues"), seulement le choix
 * fait ici. `null` si `items` est vide. */
export function pickWeighted<T>(items: T[], isPriority: (item: T) => boolean, weight: number): T | null {
  if (items.length === 0) return null;
  const indices: number[] = [];
  items.forEach((item, index) => {
    const copies = isPriority(item) ? weight : 1;
    for (let i = 0; i < copies; i++) indices.push(index);
  });
  return items[indices[Math.floor(Math.random() * indices.length)]];
}
