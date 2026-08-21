import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDueCardsSplit, replaceScheduledNotifications, getNextScheduledNotificationTime, type DueCardRow } from '../data/database';
import type { AppSettings } from '../data/settings';
import { schedule } from '../scheduler/reviewScheduler';
import type { ScheduledNotification } from '../scheduler/types';
import { createNotificationWindow, type DueItem } from '../scheduler/types';
import { REVIEW_CATEGORY } from './categories';

/** Taille de la file glissante — en dessous du plafond iOS de 64
 * notifications locales en attente, avec de la marge. */
export const QUEUE_SIZE = 50;

/** Calcule (sans rien programmer) les créneaux `ReviewScheduler` pour les
 * cartes actuellement dues — logique commune à `refillNotificationQueue`
 * (qui programme pour de vrai) et `getNextNotificationTime` (qui ne fait
 * que lire le prochain créneau, voir plus bas). */
async function computeQueueSlots(
  db: SQLiteDatabase,
  settings: AppSettings,
  now: Date
): Promise<{ due: DueCardRow[]; slots: ScheduledNotification[] }> {
  // Respecte le plafond nouvelles/révisions du jour (8 + 22 par défaut,
  // voir docs/PLAN.md) plutôt que de piocher indistinctement jusqu'à
  // `QUEUE_SIZE` parmi toutes les cartes dues — sinon des révisions en
  // retard pouvaient être noyées par un afflux de nouvelles cartes, ou
  // l'inverse. `QUEUE_SIZE` reste un plafond de sécurité en dessous de la
  // limite iOS de 64 notifications en attente, au cas où les réglages
  // (modifiables sans borne haute) dépasseraient 50.
  const due = (await getDueCardsSplit(db, now, settings)).slice(0, QUEUE_SIZE);
  if (due.length === 0) return { due, slots: [] };

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

  return { due, slots };
}

/** Recharge entièrement la file de notifications à partir des cartes
 * dues : annule tout ce qui était programmé, reprend les jusqu'à
 * `QUEUE_SIZE` cartes dues les plus anciennes, les place dans la fenêtre
 * horaire via `ReviewScheduler` (report au lendemain si ça dépasse la
 * capacité du jour), et programme une vraie notification par carte.
 *
 * À appeler à chaque ouverture de l'app et après chaque note, pour que
 * la file reste à jour (voir docs/PLAN.md, "file glissante ~50"). */
export async function refillNotificationQueue(
  db: SQLiteDatabase,
  settings: AppSettings,
  now: Date = new Date()
): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const { due, slots } = await computeQueueSlots(db, settings, now);
  if (due.length === 0) {
    await replaceScheduledNotifications(db, []);
    return 0;
  }

  const byId = new Map(due.map((row) => [row.word.id, row.word]));

  // Miroir local des créneaux réellement programmés — voir
  // `getNextNotificationTime` plus bas, qui les LIT au lieu de les
  // recalculer (demandé explicitement le 20/08/2026, l'estimation
  // précédente n'était pas jugée assez exacte).
  await replaceScheduledNotifications(
    db,
    slots.map((slot) => ({ wordId: slot.id, fireDate: slot.fireDate }))
  );

  // En parallèle, pas en séquence : programmer jusqu'à 50 notifications
  // une par une (chacune un appel au pont natif) ajoutait plusieurs
  // secondes au démarrage. Aucune de ces requêtes ne dépend du résultat
  // d'une autre, `Promise.all` est donc sûr ici.
  await Promise.all(
    slots.flatMap((slot) => {
      const word = byId.get(slot.id);
      if (!word) return [];

      return [
        Notifications.scheduleNotificationAsync({
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
        }),
      ];
    })
  );

  return slots.length;
}

/** Heure exacte de la prochaine notification, LUE depuis le miroir local
 * (`scheduled_notifications`) plutôt que recalculée — corrige un défaut
 * signalé explicitement (20/08/2026) : la version précédente rejouait
 * le calcul de planification à chaque consultation, et comme
 * l'espacement entre cartes dues simultanément est tiré aléatoirement
 * (15-30 min, voir docs/PLAN.md) à chaque calcul, l'heure affichée pouvait
 * différer de celle réellement programmée par le dernier
 * `refillNotificationQueue`. Maintenant que `refillNotificationQueue`
 * persiste les créneaux réellement programmés dans ce miroir, cette
 * fonction n'a plus qu'à les lire — plus d'approximation. Retourne
 * `null` si rien n'est programmé. */
export async function getNextNotificationTime(db: SQLiteDatabase, now: Date = new Date()): Promise<Date | null> {
  return getNextScheduledNotificationTime(db, now);
}

function randomSpacing(minMinutes: number, maxMinutes: number): number {
  return minMinutes + Math.random() * (maxMinutes - minMinutes);
}
