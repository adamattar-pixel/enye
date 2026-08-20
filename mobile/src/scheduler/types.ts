/**
 * Port TypeScript de Packages/ReviewScheduler (Swift) — spec de
 * référence : Packages/ReviewScheduler/Sources/ReviewScheduler/*.swift
 * et les 9 tests associés.
 */

/** Fenêtre horaire quotidienne pendant laquelle les notifications ont le
 * droit de partir, et l'espacement à laisser entre deux consécutives.
 * Suppose une fenêtre sur un seul jour (`startHour` avant `endHour`) —
 * celle de ce projet est 8h-22h, elle ne traverse jamais minuit. */
export interface NotificationWindow {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  /** Plus petit écart, en minutes, jamais laissé entre deux notifications le même jour. */
  minSpacingMinutes: number;
  /** Plus grand écart, en minutes, qu'un générateur d'espacement de l'appelant
   * est censé produire. Pas imposé par le planificateur lui-même (il utilise
   * simplement ce que `nextSpacingMinutes` renvoie) — gardé ici pour que la
   * fenêtre décrive toute la politique au même endroit. */
  maxSpacingMinutes: number;
}

export function createNotificationWindow(
  params: Pick<NotificationWindow, 'startHour' | 'endHour' | 'minSpacingMinutes' | 'maxSpacingMinutes'> &
    Partial<Pick<NotificationWindow, 'startMinute' | 'endMinute'>>
): NotificationWindow {
  return {
    startMinute: 0,
    endMinute: 0,
    ...params,
  };
}

/** Réglages validés de Lexis : 8h-22h, 15 à 30 minutes entre deux cartes. */
export const lexisDefaultWindow: NotificationWindow = createNotificationWindow({
  startHour: 8,
  endHour: 22,
  minSpacingMinutes: 15,
  maxSpacingMinutes: 30,
});

/** Une carte en attente d'un créneau, identifiée par son id et le
 * moment où le moteur SM-2 dit qu'elle est devenue due. Le tri par
 * `dueDate` est ce que "traité par ordre d'échéance" signifie dans ce
 * module — plus une carte attend, plus tôt elle reçoit un créneau. */
export interface DueItem {
  id: string;
  dueDate: Date;
}

/** Une carte avec une vraie date de déclenchement de notification assignée. */
export interface ScheduledNotification {
  id: string;
  fireDate: Date;
}
