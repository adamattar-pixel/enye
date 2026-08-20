import type { DueItem, NotificationWindow, ScheduledNotification } from './types';

/**
 * Transforme une liste de cartes dues en vraies dates de déclenchement de
 * notification, sans jamais dépasser la capacité d'une fenêtre d'un jour.
 * C'est la règle défensive de l'audit des réglages Lexis : 15 nouvelles +
 * 80 révisions (95 cartes/jour) ne tiennent pas dans une fenêtre de 14h
 * espacée de 15-30 min (~28-56 créneaux selon le tirage) — plutôt que de
 * tasser l'espacement pour tout faire rentrer, l'excédent est reporté à
 * la fenêtre du lendemain, toujours en respectant l'espacement minimum et
 * toujours trié par échéance la plus ancienne d'abord.
 *
 * Fonction pure : pas d'I/O, pas d'appel à `expo-notifications`. La
 * couche app est responsable de transformer les `ScheduledNotification`
 * en vraies notifications programmées.
 *
 * Divergence signalée par rapport à la version Swift : pas de paramètre
 * `calendar` injectable — TypeScript/`Date` n'a pas d'équivalent direct à
 * `Calendar` en tant qu'objet passable. Le comportement (fenêtre,
 * espacement, report) est strictement identique ; seule la manière de
 * fixer le fuseau horaire pour les tests diffère (voir
 * `reviewScheduler.test.ts`, `process.env.TZ`).
 */
export function schedule(
  items: DueItem[],
  window: NotificationWindow,
  now: Date,
  nextSpacingMinutes: () => number
): ScheduledNotification[] {
  const sorted = [...items].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  let cursor = now;
  const results: ScheduledNotification[] = [];

  for (const item of sorted) {
    cursor = firstAvailableSlot(cursor, window);
    results.push({ id: item.id, fireDate: cursor });
    cursor = addMinutes(cursor, nextSpacingMinutes());
  }

  return results;
}

/** Le premier moment à `date` ou après qui tombe dans la fenêtre :
 * `date` elle-même si déjà dans la fenêtre du jour, le début de la
 * fenêtre du jour si `date` est trop tôt, ou le début de la fenêtre du
 * lendemain si `date` est après la fin de la fenêtre du jour (c'est le
 * comportement "report au lendemain"). */
export function firstAvailableSlot(date: Date, window: NotificationWindow): Date {
  const start = windowStart(date, window);
  const end = windowEnd(date, window);

  if (date.getTime() < start.getTime()) {
    return start;
  }
  if (date.getTime() > end.getTime()) {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    return windowStart(nextDay, window);
  }
  return date;
}

function windowStart(date: Date, window: NotificationWindow): Date {
  const result = new Date(date);
  result.setHours(window.startHour, window.startMinute, 0, 0);
  return result;
}

function windowEnd(date: Date, window: NotificationWindow): Date {
  const result = new Date(date);
  result.setHours(window.endHour, window.endMinute, 0, 0);
  return result;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
