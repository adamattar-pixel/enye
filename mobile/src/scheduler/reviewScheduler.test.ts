// Ce fichier suppose que le fuseau horaire du processus est UTC, pour
// reproduire les dates fixes du test Swift original (qui utilisait
// explicitement un `Calendar` configuré en UTC). Le fixer *dans* ce
// fichier via `process.env.TZ = 'UTC'` ne suffit pas : sur Windows,
// `Date` ne relit pas cette variable une fois le processus Node démarré.
// Il est donc fixé en amont, au lancement de Node — voir le script
// `test` dans package.json (`cross-env TZ=UTC jest`).

import { schedule } from './reviewScheduler';
import { createNotificationWindow, type DueItem } from './types';

// Port direct de Packages/ReviewScheduler/Tests/ReviewSchedulerTests/ReviewSchedulerTests.swift
// (9 tests). Même comportement attendu ; toute divergence est un bug de
// portage, pas un choix délibéré.

function date(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min));
}

const window = createNotificationWindow({ startHour: 8, endHour: 22, minSpacingMinutes: 15, maxSpacingMinutes: 30 });

describe('ReviewScheduler', () => {
  // MARK: - Basic placement

  test('empty items produces empty schedule', () => {
    const result = schedule([], window, date(2026, 8, 19, 9, 0), () => 15);
    expect(result).toEqual([]);
  });

  test('items within capacity stay same day at fixed spacing', () => {
    const items: DueItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: `card${i}`,
      dueDate: new Date(date(2026, 8, 19, 8, 0).getTime() + i * 60_000),
    }));
    const result = schedule(items, window, date(2026, 8, 19, 8, 0), () => 15);

    expect(result).toHaveLength(5);
    result.forEach((slot, index) => {
      const expected = new Date(date(2026, 8, 19, 8, 0).getTime() + index * 15 * 60_000);
      expect(slot.fireDate).toEqual(expected);
    });
  });

  test('sorted by due date regardless of input order', () => {
    const items: DueItem[] = [
      { id: 'newest', dueDate: date(2026, 8, 19, 10, 0) },
      { id: 'oldest', dueDate: date(2026, 8, 18, 9, 0) },
      { id: 'middle', dueDate: date(2026, 8, 19, 8, 0) },
    ];
    const result = schedule(items, window, date(2026, 8, 19, 8, 0), () => 15);

    expect(result.map((r) => r.id)).toEqual(['oldest', 'middle', 'newest']);
  });

  // MARK: - Window clamping

  test('now before window start uses window start', () => {
    const items: DueItem[] = [{ id: 'card0', dueDate: date(2026, 8, 19, 6, 0) }];
    const result = schedule(items, window, date(2026, 8, 19, 6, 0), () => 15);

    expect(result[0]?.fireDate).toEqual(date(2026, 8, 19, 8, 0));
  });

  test('now after window end rolls to next day window start', () => {
    const items: DueItem[] = [{ id: 'card0', dueDate: date(2026, 8, 19, 23, 0) }];
    const result = schedule(items, window, date(2026, 8, 19, 23, 0), () => 15);

    expect(result[0]?.fireDate).toEqual(date(2026, 8, 20, 8, 0));
  });

  // MARK: - The defensive overflow rule

  test('overflow spills to next day instead of compressing spacing', () => {
    // Fenêtre d'1h (8h-9h), espacement 20 min -> 4 créneaux/jour (8:00, 8:20, 8:40, 9:00).
    const tightWindow = createNotificationWindow({ startHour: 8, endHour: 9, minSpacingMinutes: 20, maxSpacingMinutes: 20 });
    const items: DueItem[] = Array.from({ length: 5 }, (_, i) => ({ id: `card${i}`, dueDate: date(2026, 8, 19, 8, 0) }));

    const result = schedule(items, tightWindow, date(2026, 8, 19, 8, 0), () => 20);

    expect(result).toHaveLength(5);
    expect(result[0].fireDate).toEqual(date(2026, 8, 19, 8, 0));
    expect(result[1].fireDate).toEqual(date(2026, 8, 19, 8, 20));
    expect(result[2].fireDate).toEqual(date(2026, 8, 19, 8, 40));
    expect(result[3].fireDate).toEqual(date(2026, 8, 19, 9, 0));
    // La 5ème carte ne tient pas avant 9:00 -> reportée au début de la
    // fenêtre du lendemain, jamais tassée pour rentrer avant 9:00.
    expect(result[4].fireDate).toEqual(date(2026, 8, 20, 8, 0));
  });

  test('overflow across multiple days', () => {
    const tightWindow = createNotificationWindow({ startHour: 8, endHour: 8, minSpacingMinutes: 30, maxSpacingMinutes: 30 });
    // Une fenêtre de longueur nulle (8h-8h) signifie exactement 1 créneau/jour.
    const items: DueItem[] = Array.from({ length: 3 }, (_, i) => ({ id: `card${i}`, dueDate: date(2026, 8, 19, 8, 0) }));

    const result = schedule(items, tightWindow, date(2026, 8, 19, 8, 0), () => 30);

    expect(result.map((r) => r.fireDate)).toEqual([
      date(2026, 8, 19, 8, 0),
      date(2026, 8, 20, 8, 0),
      date(2026, 8, 21, 8, 0),
    ]);
  });

  test('spacing is never compressed below what the generator returns', () => {
    const items: DueItem[] = Array.from({ length: 3 }, (_, i) => ({ id: `card${i}`, dueDate: date(2026, 8, 19, 8, 0) }));
    const result = schedule(items, window, date(2026, 8, 19, 8, 0), () => 30);

    expect(result[1].fireDate.getTime() - result[0].fireDate.getTime()).toBe(30 * 60_000);
    expect(result[2].fireDate.getTime() - result[1].fireDate.getTime()).toBe(30 * 60_000);
  });

  test('Lexis settings A fits comfortably within one day', () => {
    // Réglages retenus : 8 nouvelles + 22 révisions = 30 cartes/jour.
    const items: DueItem[] = Array.from({ length: 30 }, (_, i) => ({ id: `card${i}`, dueDate: date(2026, 8, 19, 7, 0) }));
    const result = schedule(items, window, date(2026, 8, 19, 8, 0), () => 22.5);

    const dayStart = date(2026, 8, 19, 0, 0).getTime();
    const dayEnd = date(2026, 8, 20, 0, 0).getTime();
    const allSameDay = result.every((r) => r.fireDate.getTime() >= dayStart && r.fireDate.getTime() < dayEnd);

    expect(allSameDay).toBe(true);
  });
});
