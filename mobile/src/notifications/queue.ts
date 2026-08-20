import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDueCards } from '../data/database';
import type { AppSettings } from '../data/settings';
import { schedule } from '../scheduler/reviewScheduler';
import { createNotificationWindow, type DueItem } from '../scheduler/types';
import { REVIEW_CATEGORY } from './categories';

/** Taille de la file glissante — en dessous du plafond iOS de 64
 * notifications locales en attente, avec de la marge. */
export const QUEUE_SIZE = 50;

/** Recharge entièrement la file de notifications à partir des cartes
 * dues : annule tout ce qui était programmé, reprend les jusqu'à
 * `QUEUE_SIZE` cartes dues les plus anciennes, les place dans la fenêtre
 * horaire via `ReviewScheduler` (report au lendemain si ça dépasse la
 * capacité du jour), et programme une vraie notification par carte.
 *
 * À appeler à chaque ouverture de l'app et après chaque note, pour que
 * la file reste à jour (voir PLAN.md, "file glissante ~50"). */
export async function refillNotificationQueue(
  db: SQLiteDatabase,
  settings: AppSettings,
  now: Date = new Date()
): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const due = await getDueCards(db, now, QUEUE_SIZE);
  if (due.length === 0) return 0;

  const window = createNotificationWindow({
    startHour: settings.windowStartHour,
    startMinute: settings.windowStartMinute,
    endHour: settings.windowEndHour,
    endMinute: settings.windowEndMinute,
    minSpacingMinutes: 15,
    maxSpacingMinutes: 30,
  });

  const items: DueItem[] = due.map((row) => ({ id: row.word.id, dueDate: row.card.dueDate }));
  const slots = schedule(items, window, now, () => randomSpacing(window.minSpacingMinutes, window.maxSpacingMinutes));

  const byId = new Map(due.map((row) => [row.word.id, row.word]));

  for (const slot of slots) {
    const word = byId.get(slot.id);
    if (!word) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: word.spanish,
        body: 'Toca «Ver traducción» para revelar.',
        categoryIdentifier: REVIEW_CATEGORY,
        data: { wordId: word.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: slot.fireDate,
      },
    });
  }

  return slots.length;
}

function randomSpacing(minMinutes: number, maxMinutes: number): number {
  return minMinutes + Math.random() * (maxMinutes - minMinutes);
}
