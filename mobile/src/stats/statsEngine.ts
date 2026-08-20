import type { SM2Grade } from '../sm2/types';

/** Fonctions pures pour l'écran Statistiques — pas d'I/O, pas de SQLite ;
 * `database.ts` fournit les lignes brutes, ces fonctions en tirent les
 * chiffres affichés. */

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Nombre de jours consécutifs, en remontant depuis `today`, avec au
 * moins une révision. Si aucune révision n'a encore eu lieu aujourd'hui,
 * ça ne casse pas la série tant qu'hier en avait une — l'utilisateur n'a
 * simplement pas encore révisé aujourd'hui. */
export function computeStreak(reviewDates: Date[], today: Date): number {
  const daysWithReview = new Set(reviewDates.map(dayKey));

  let cursor = new Date(today);
  if (!daysWithReview.has(dayKey(cursor))) {
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (daysWithReview.has(dayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Fraction des notes "réussies" (Bien/Fácil) parmi toutes les notes
 * données. 0 si aucune révision n'a encore eu lieu. */
export function computeSuccessRate(grades: SM2Grade[]): number {
  if (grades.length === 0) return 0;
  const successCount = grades.filter((g) => g === 'good' || g === 'easy').length;
  return successCount / grades.length;
}

/** Nombre de cartes dues pour chacun des `days` prochains jours à partir
 * de `today` (index 0 = aujourd'hui). Les échéances passées (cartes déjà
 * en retard) sont comptées dans le jour 0, pas ignorées. */
export function computeForecast(dueDates: Date[], today: Date, days: number): number[] {
  const counts = new Array(days).fill(0) as number[];
  const dayZero = startOfDay(today).getTime();

  for (const date of dueDates) {
    const diffDays = Math.floor((startOfDay(date).getTime() - dayZero) / (24 * 60 * 60 * 1000));
    const bucket = Math.max(0, diffDays);
    if (bucket < days) counts[bucket] += 1;
  }
  return counts;
}
