import { shuffle } from '../utils/shuffle';

/** Une vidéo ne peut pas être choisie si elle a été utilisée dans les
 * 3 derniers exercices (au sens "notés", voir database.ts) — demandé
 * explicitement. Voir PLAN.md pour l'algorithme complet et AUDIT.md
 * pour la limite assumée (ne compte que les exercices terminés). */
export const VIDEO_COOLDOWN = 3;

/**
 * Détermine quelles vidéos, parmi celles ayant au moins un segment dû
 * maintenant, sont éligibles compte tenu du cooldown — avec
 * relâchement progressif si trop peu de vidéos sont disponibles pour
 * respecter le cooldown strictement (voir PLAN.md, "Cas limite").
 *
 * Fonction pure : ne fait aucune requête, ne choisit rien elle-même —
 * `dueVideoIds` et `recentVideoIdsOrdered` sont déjà calculés par
 * l'appelant (voir `database.ts`, `getDueListeningCardsSplit`).
 *
 * @param dueVideoIds vidéos ayant au moins un segment dû maintenant
 * @param recentVideoIdsOrdered derniers video_id distincts utilisés,
 *   du PLUS RÉCENT au plus ancien (voir `getRecentListeningVideoIds`)
 * @param cooldown nombre de derniers exercices à exclure, par défaut
 *   `VIDEO_COOLDOWN`
 */
export function selectEligibleVideoIds(
  dueVideoIds: string[],
  recentVideoIdsOrdered: string[],
  cooldown: number = VIDEO_COOLDOWN
): string[] {
  const dueSet = new Set(dueVideoIds);

  for (let windowSize = Math.min(cooldown, recentVideoIdsOrdered.length); windowSize >= 0; windowSize--) {
    const excluded = new Set(recentVideoIdsOrdered.slice(0, windowSize));
    const eligible = dueVideoIds.filter((id) => !excluded.has(id));
    if (eligible.length > 0) return eligible;
  }

  // dueVideoIds était vide dès le départ — rien à faire, l'appelant
  // gère ce cas comme "rien à réviser", pas comme un échec de cooldown.
  return [...dueSet];
}

/** Choisit une vidéo au hasard, uniformément, parmi les vidéos
 * éligibles — jamais pondéré par le nombre de segments dus de chaque
 * vidéo (voir PLAN.md : c'est précisément ce que la demande explicite
 * interdit). `null` si `eligibleVideoIds` est vide. */
export function pickRandomVideo(eligibleVideoIds: string[]): string | null {
  if (eligibleVideoIds.length === 0) return null;
  return shuffle(eligibleVideoIds)[0];
}

/** Choisit un segment au hasard, uniformément, parmi les segments dus
 * d'UNE vidéo déjà choisie — `segments` doit déjà être filtré sur cette
 * vidéo par l'appelant. `null` si `segments` est vide. */
export function pickRandomSegment<T>(segments: T[]): T | null {
  if (segments.length === 0) return null;
  return shuffle(segments)[0];
}
