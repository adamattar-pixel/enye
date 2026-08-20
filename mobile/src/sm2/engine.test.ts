import { review } from './engine';
import { createCard } from './types';

// Port direct de Packages/SM2Engine/Tests/SM2EngineTests/SM2EngineTests.swift
// (13 tests). Même comportement attendu ; toute divergence est un bug de
// portage, pas un choix délibéré.

const now = new Date(1_700_000_000 * 1000); // Date(timeIntervalSince1970: 1_700_000_000)

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

describe('SM2Engine', () => {
  // MARK: - New card, learning steps

  test('new card again stays on first learning step', () => {
    const card = createCard({ lifecycle: 'new', dueDate: now });
    const next = review(card, 'again', now);

    expect(next.lifecycle).toBe('learning');
    expect(next.learningStepIndex).toBe(0);
    expect(next.dueDate).toEqual(addSeconds(now, 60)); // 1 minute
  });

  test('new card good advances to second learning step', () => {
    const card = createCard({ lifecycle: 'new', dueDate: now });
    const next = review(card, 'good', now);

    expect(next.lifecycle).toBe('learning');
    expect(next.learningStepIndex).toBe(1);
    expect(next.dueDate).toEqual(addSeconds(now, 600)); // 10 minutes
  });

  test('card graduates after final learning step good', () => {
    const card = createCard({ learningStepIndex: 1, lifecycle: 'learning', dueDate: now });
    const next = review(card, 'good', now);

    expect(next.lifecycle).toBe('review');
    expect(next.intervalDays).toBe(1);
    expect(next.repetitions).toBe(1);
    expect(next.dueDate).toEqual(addSeconds(now, 24 * 60 * 60));
  });

  test('new card easy graduates immediately with longer interval and ease bump', () => {
    const card = createCard({ lifecycle: 'new', dueDate: now });
    const next = review(card, 'easy', now);

    expect(next.lifecycle).toBe('review');
    expect(next.intervalDays).toBe(4);
    expect(next.repetitions).toBe(1);
    expect(next.easeFactor).toBeCloseTo(2.65, 4); // 2.5 + 0.15
    expect(next.dueDate).toEqual(addSeconds(now, 4 * 24 * 60 * 60));
  });

  test('hard repeats current learning step without advancing', () => {
    const card = createCard({ learningStepIndex: 0, lifecycle: 'learning', dueDate: now });
    const next = review(card, 'hard', now);

    expect(next.lifecycle).toBe('learning');
    expect(next.learningStepIndex).toBe(0);
    expect(next.dueDate).toEqual(addSeconds(now, 60));
  });

  // MARK: - Review phase

  test('review good multiplies interval by ease', () => {
    const card = createCard({ easeFactor: 2.5, intervalDays: 6, repetitions: 2, lifecycle: 'review', dueDate: now });
    const next = review(card, 'good', now);

    expect(next.intervalDays).toBe(15); // 6 * 2.5
    expect(next.easeFactor).toBe(2.5); // unchanged on "Bien"
    expect(next.repetitions).toBe(3);
    expect(next.lifecycle).toBe('review');
  });

  test('review hard applies smaller multiplier and lowers ease', () => {
    const card = createCard({ easeFactor: 2.5, intervalDays: 10, repetitions: 2, lifecycle: 'review', dueDate: now });
    const next = review(card, 'hard', now);

    expect(next.intervalDays).toBe(12); // 10 * 1.2
    expect(next.easeFactor).toBeCloseTo(2.35, 4); // 2.5 - 0.15
    expect(next.lifecycle).toBe('review');
  });

  test('review easy applies easy bonus and raises ease', () => {
    const card = createCard({ easeFactor: 2.5, intervalDays: 10, repetitions: 2, lifecycle: 'review', dueDate: now });
    const next = review(card, 'easy', now);

    expect(next.intervalDays).toBeCloseTo(32.5, 4); // 10 * 2.5 * 1.3
    expect(next.easeFactor).toBeCloseTo(2.65, 4); // 2.5 + 0.15
  });

  test('review again lapses into relearning and resets interval', () => {
    const card = createCard({
      easeFactor: 2.5,
      intervalDays: 20,
      repetitions: 5,
      lapses: 0,
      lifecycle: 'review',
      dueDate: now,
    });
    const next = review(card, 'again', now);

    expect(next.lifecycle).toBe('relearning');
    expect(next.lapses).toBe(1);
    expect(next.easeFactor).toBeCloseTo(2.3, 4); // 2.5 - 0.20
    expect(next.intervalDays).toBe(1); // floored at minimumIntervalDays, 20 * 0% = 0
    expect(next.dueDate).toEqual(addSeconds(now, 600)); // 10-minute relearning step
    expect(next.repetitions).toBe(5); // untouched by a lapse
  });

  test('ease factor never drops below minimum', () => {
    let card = createCard({ easeFactor: 1.35, intervalDays: 5, lifecycle: 'review', dueDate: now });
    for (let i = 0; i < 5; i++) {
      card = review(card, 'again', now);
      card = { ...card, lifecycle: 'review' }; // simulate instantly graduating relearning for this stress test
    }
    expect(card.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  test('hard interval never shrinks even at low ease', () => {
    const card = createCard({ easeFactor: 1.3, intervalDays: 1, lifecycle: 'review', dueDate: now });
    const next = review(card, 'hard', now);

    expect(next.intervalDays).toBeGreaterThan(card.intervalDays);
  });

  // MARK: - Relearning phase (post-lapse)

  test('relearning good on last step returns to review with preserved post-lapse interval', () => {
    const card = createCard({
      easeFactor: 2.3,
      intervalDays: 4,
      learningStepIndex: 0,
      lifecycle: 'relearning',
      dueDate: now,
    });
    const next = review(card, 'good', now);

    expect(next.lifecycle).toBe('review');
    expect(next.intervalDays).toBe(4); // the interval computed at lapse time, untouched here
    expect(next.dueDate).toEqual(addSeconds(now, 4 * 24 * 60 * 60));
  });

  test('relearning again restarts relearning steps', () => {
    const card = createCard({ learningStepIndex: 0, lifecycle: 'relearning', dueDate: now });
    const next = review(card, 'again', now);

    expect(next.lifecycle).toBe('relearning');
    expect(next.learningStepIndex).toBe(0);
    expect(next.dueDate).toEqual(addSeconds(now, 600));
  });
});
