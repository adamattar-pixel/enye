import * as Notifications from 'expo-notifications';

/**
 * Catégorie de la 1ère notification (le mot seul) — un seul bouton,
 * qui ne doit PAS ramener l'app au premier plan (c'est tout l'enjeu de
 * la tâche 0 : le traiter en arrière-plan, app fermée).
 */
export const REVIEW_CATEGORY = 'review';
export const REVEAL_ACTION = 'reveal';

/**
 * Catégorie de la 2ème notification (traduction + notation), programmée
 * depuis le handler de la 1ère — teste le montage en deux temps demandé.
 */
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

/** Programme la 1ère notification (mot seul) dans `seconds` secondes. */
export async function scheduleReviewNotification(seconds: number): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'gato',
      body: 'Toca «Ver traducción» para revelar.',
      categoryIdentifier: REVIEW_CATEGORY,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
    },
  });
}

/**
 * Programmée depuis le handler d'arrière-plan de la 1ère notification —
 * c'est la partie la plus incertaine de la tâche 0 : appeler l'API native
 * de programmation depuis un contexte JS réveillé par un tap, sans que
 * l'app ait été ouverte au premier plan.
 */
export async function scheduleGradeNotification(secondsFromNow: number): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'gato → chat',
      body: 'Un gato duerme en la ventana. / Un chat dort sur la fenêtre.',
      categoryIdentifier: GRADE_CATEGORY,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsFromNow,
      repeats: false,
    },
  });
}
