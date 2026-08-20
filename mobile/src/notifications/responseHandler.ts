import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getWordWithCard, updateCard, logReview } from '../data/database';
import { getSettings } from '../data/settings';
import { review } from '../sm2/engine';
import type { SM2Grade } from '../sm2/types';
import { GRADE_ACTIONS, GRADE_CATEGORY, REVEAL_ACTION } from './categories';
import { refillNotificationQueue } from './queue';

const ACTION_TO_GRADE: Record<string, SM2Grade> = {
  [GRADE_ACTIONS.again]: 'again',
  [GRADE_ACTIONS.hard]: 'hard',
  [GRADE_ACTIONS.good]: 'good',
  [GRADE_ACTIONS.easy]: 'easy',
};

export type NotificationOutcome =
  | { kind: 'ignored' }
  | { kind: 'revealed'; wordId: string }
  | { kind: 'graded'; wordId: string; grade: SM2Grade };

/** Traite le tap sur un bouton de notification — c'est le cœur de la
 * boucle « jamais ouvrir l'app » (voir tâche 0) :
 * - reveal → programme la notification de traduction+notation, avec le
 *   vrai mot (au lieu du "gato" figé du prototype de la tâche 0) ;
 * - une note → applique SM2Engine.review(), persiste, journalise, et
 *   recharge la file pour qu'elle reste à jour.
 *
 * Ne fait rien de silencieux en cas d'échec : si la carte n'existe plus
 * (mot supprimé entre-temps) ou si l'action ne correspond à rien de
 * connu, renvoie `{ kind: 'ignored' }` plutôt que de planter. */
export async function handleNotificationResponse(
  db: SQLiteDatabase,
  response: Notifications.NotificationResponse,
  now: Date = new Date()
): Promise<NotificationOutcome> {
  const data = response.notification.request.content.data as { wordId?: string } | undefined;
  const wordId = data?.wordId;
  if (!wordId) return { kind: 'ignored' };

  const actionIdentifier = response.actionIdentifier;

  if (actionIdentifier === REVEAL_ACTION) {
    const row = await getWordWithCard(db, wordId);
    if (!row) return { kind: 'ignored' };

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${row.word.spanish} → ${row.word.french}`,
        body: `${row.word.exampleEs}\n${row.word.exampleFr}`,
        categoryIdentifier: GRADE_CATEGORY,
        data: { wordId: row.word.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        repeats: false,
      },
    });
    return { kind: 'revealed', wordId };
  }

  const grade = ACTION_TO_GRADE[actionIdentifier];
  if (!grade) return { kind: 'ignored' };

  const row = await getWordWithCard(db, wordId);
  if (!row) return { kind: 'ignored' };

  const nextState = review(row.card, grade, now);
  await updateCard(db, wordId, nextState);
  await logReview(db, wordId, grade, now);

  const settings = await getSettings(db);
  await refillNotificationQueue(db, settings, now);

  return { kind: 'graded', wordId, grade };
}
