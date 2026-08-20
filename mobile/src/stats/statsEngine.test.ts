// Suppose TZ=UTC, fixé avant le démarrage de Node via cross-env dans
// package.json — voir reviewScheduler.test.ts pour le pourquoi.
import { computeStreak, computeSuccessRate, computeForecast } from './statsEngine';

function d(y: number, m: number, day: number, h = 12): Date {
  return new Date(Date.UTC(y, m - 1, day, h));
}

describe('computeStreak', () => {
  test('counts consecutive days ending today', () => {
    const today = d(2026, 8, 20);
    const reviews = [d(2026, 8, 18), d(2026, 8, 19), d(2026, 8, 20)];
    expect(computeStreak(reviews, today)).toBe(3);
  });

  test('does not break the streak if today has no review yet, as long as yesterday did', () => {
    const today = d(2026, 8, 20, 7); // early morning, hasn't reviewed yet today
    const reviews = [d(2026, 8, 18), d(2026, 8, 19)];
    expect(computeStreak(reviews, today)).toBe(2);
  });

  test('resets to 0 if there is a gap', () => {
    const today = d(2026, 8, 20);
    const reviews = [d(2026, 8, 10), d(2026, 8, 11)];
    expect(computeStreak(reviews, today)).toBe(0);
  });

  test('multiple reviews on the same day only count once', () => {
    const today = d(2026, 8, 20);
    const reviews = [d(2026, 8, 20, 8), d(2026, 8, 20, 14), d(2026, 8, 20, 20)];
    expect(computeStreak(reviews, today)).toBe(1);
  });

  test('empty history gives a streak of 0', () => {
    expect(computeStreak([], d(2026, 8, 20))).toBe(0);
  });
});

describe('computeSuccessRate', () => {
  test('returns 0 for no reviews', () => {
    expect(computeSuccessRate([])).toBe(0);
  });

  test('counts good and easy as success, again and hard as failure', () => {
    expect(computeSuccessRate(['good', 'easy', 'again', 'hard'])).toBe(0.5);
  });

  test('all successful gives 1', () => {
    expect(computeSuccessRate(['good', 'good', 'easy'])).toBe(1);
  });

  test('all failed gives 0', () => {
    expect(computeSuccessRate(['again', 'hard'])).toBe(0);
  });
});

describe('computeForecast', () => {
  test('buckets due dates into the right day index', () => {
    const today = d(2026, 8, 20);
    const dueDates = [d(2026, 8, 20), d(2026, 8, 21), d(2026, 8, 21), d(2026, 8, 23)];
    expect(computeForecast(dueDates, today, 7)).toEqual([1, 2, 0, 1, 0, 0, 0]);
  });

  test('overdue cards (in the past) are counted in day 0, not dropped', () => {
    const today = d(2026, 8, 20);
    const dueDates = [d(2026, 8, 15), d(2026, 8, 18)];
    expect(computeForecast(dueDates, today, 7)).toEqual([2, 0, 0, 0, 0, 0, 0]);
  });

  test('dates beyond the forecast window are dropped, not overflowed into the last bucket', () => {
    const today = d(2026, 8, 20);
    const dueDates = [d(2026, 8, 30)];
    expect(computeForecast(dueDates, today, 7)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test('empty input gives all zeros', () => {
    expect(computeForecast([], d(2026, 8, 20), 3)).toEqual([0, 0, 0]);
  });
});
