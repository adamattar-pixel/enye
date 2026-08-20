import * as Notifications from 'expo-notifications';

/** Catégorie de la 1ère notification (le mot seul) — un seul bouton, qui
 * ne ramène pas l'app au premier plan (`opensAppToForeground: false`) :
 * validé sur device réel tant que l'app n'a pas été force-quittée (voir
 * AUDIT.md, tâche 0). */
export const REVIEW_CATEGORY = 'review';
export const REVEAL_ACTION = 'reveal';

/** Catégorie de la 2ème notification (traduction + notation),
 * programmée depuis le handler de la 1ère. */
export const GRADE_CATEGORY = 'grade';
export const GRADE_ACTIONS = {
  again: 'again',
  hard: 'hard',
  good: 'good',
  easy: 'easy',
} as const;

export async function ensurePermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return requested.granted;
}

export async function registerCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(REVIEW_CATEGORY, [
    {
      identifier: REVEAL_ACTION,
      buttonTitle: 'Ver traducción',
      options: { opensAppToForeground: false },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(GRADE_CATEGORY, [
    { identifier: GRADE_ACTIONS.again, buttonTitle: 'Otra vez', options: { opensAppToForeground: false } },
    { identifier: GRADE_ACTIONS.hard, buttonTitle: 'Difícil', options: { opensAppToForeground: false } },
    { identifier: GRADE_ACTIONS.good, buttonTitle: 'Bien', options: { opensAppToForeground: false } },
    { identifier: GRADE_ACTIONS.easy, buttonTitle: 'Fácil', options: { opensAppToForeground: false } },
  ]);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
