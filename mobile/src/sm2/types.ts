/**
 * Port TypeScript de Packages/SM2Engine (Swift) — spec de référence :
 * Packages/SM2Engine/Sources/SM2Engine/*.swift et les 13 tests associés.
 * Comportement censé être strictement identique ; toute divergence
 * volontaire est signalée en commentaire à l'endroit où elle apparaît.
 */

/** Une des quatre notes possibles après révision d'une carte.
 * Correspond aux boutons espagnols de l'UI : again = "Otra vez",
 * hard = "Difícil", good = "Bien", easy = "Fácil". Le moteur reste
 * indépendant de la langue ; les libellés vivent dans l'UI. */
export type SM2Grade = 'again' | 'hard' | 'good' | 'easy';

/** Cycle de vie d'une carte, identique au modèle d'Anki : une carte
 * neuve traverse des étapes `learning` (délais courts, en minutes)
 * avant de « graduer » vers `review` (intervalles longs, en jours).
 * Un échec en `review` rétrograde la carte vers `relearning` (étapes
 * courtes similaires à `learning`) avant qu'elle ne revienne en `review`. */
export type SM2CardLifecycle = 'new' | 'learning' | 'review' | 'relearning';

/** État de planification complet d'une carte, indépendant de toute
 * couche de stockage. `review()` est une fonction pure d'un
 * `SM2CardState` + une note vers le `SM2CardState` suivant. */
export interface SM2CardState {
  /** Facteur de facilité SuperMemo : de combien l'intervalle est
   * multiplié sur un "Bien". Démarre à 2.5, ne descend jamais sous
   * `SM2Config.minimumEaseFactor`. */
  easeFactor: number;
  /** Intervalle de révision actuel, en jours. Seulement pertinent une
   * fois la carte graduée au moins une fois vers `review` ; ignoré
   * tant que `new`, `learning` ou `relearning` (celles-ci sont
   * planifiées en minutes via `learningStepIndex`). */
  intervalDays: number;
  /** Nombre de fois où cette carte a été notée en état `review`. */
  repetitions: number;
  /** Nombre de fois où cette carte a échoué (notée "Otra vez" en `review`). */
  lapses: number;
  /** Index dans la liste d'étapes active (`learningStepsMinutes` ou
   * `relearningStepsMinutes`) tant que `learning` / `relearning`. */
  learningStepIndex: number;
  /** Où se situe actuellement la carte dans son cycle de vie. */
  lifecycle: SM2CardLifecycle;
  /** Prochain moment où cette carte doit être présentée. */
  dueDate: Date;
}

export function createCard(overrides: Partial<SM2CardState> = {}): SM2CardState {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    learningStepIndex: 0,
    lifecycle: 'new',
    dueDate: new Date(),
    ...overrides,
  };
}

/** Constantes ajustables de l'algorithme. Les valeurs par défaut
 * reprennent celles d'Anki (le vrai SM-2, pas une version simplifiée). */
export interface SM2Config {
  minimumEaseFactor: number;
  easyBonus: number;
  hardIntervalMultiplier: number;

  /** Deltas de facteur de facilité appliqués quand une carte `review` est notée. */
  againEaseDelta: number;
  hardEaseDelta: number;
  easyEaseDelta: number;

  /** Délais, en minutes, qu'une carte neuve/en apprentissage traverse
   * avant de graduer vers `review`. Par défaut chez Anki : [1, 10]. */
  learningStepsMinutes: number[];

  /** Délais, en minutes, qu'une carte en échec traverse avant de
   * revenir en `review`. Par défaut chez Anki : [10]. */
  relearningStepsMinutes: number[];

  /** Intervalle, en jours, accordé en graduant via "Bien". */
  graduatingIntervalDays: number;

  /** Intervalle, en jours, accordé en graduant immédiatement via "Fácil". */
  easyGraduatingIntervalDays: number;

  /** Fraction de l'intervalle pré-échec conservée une fois le
   * relearning terminé. Par défaut chez Anki : 0% (on repart de zéro),
   * plancher à `minimumIntervalDays`. */
  lapseNewIntervalPercent: number;

  /** Plus petit intervalle, en jours, qu'une carte `review` peut recevoir. */
  minimumIntervalDays: number;
}

export const ankiConfig: SM2Config = {
  minimumEaseFactor: 1.3,
  easyBonus: 1.3,
  hardIntervalMultiplier: 1.2,
  againEaseDelta: -0.2,
  hardEaseDelta: -0.15,
  easyEaseDelta: 0.15,
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  graduatingIntervalDays: 1,
  easyGraduatingIntervalDays: 4,
  lapseNewIntervalPercent: 0.0,
  minimumIntervalDays: 1,
};
