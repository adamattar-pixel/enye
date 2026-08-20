import { ankiConfig, type SM2CardState, type SM2Config, type SM2Grade } from './types';

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60_000);
}

/** Logique de planification pure : à partir de l'état actuel d'une
 * carte, d'une note et de "maintenant", renvoie l'état suivant de la
 * carte. Pas d'I/O, pas de persistance. */
export function review(
  card: SM2CardState,
  grade: SM2Grade,
  now: Date = new Date(),
  config: SM2Config = ankiConfig
): SM2CardState {
  switch (card.lifecycle) {
    case 'new':
    case 'learning':
      return reviewLearningPhase(card, grade, now, config, false);
    case 'relearning':
      return reviewLearningPhase(card, grade, now, config, true);
    case 'review':
      return reviewReviewPhase(card, grade, now, config);
    default: {
      const exhaustive: never = card.lifecycle;
      throw new Error(`Unhandled lifecycle: ${exhaustive}`);
    }
  }
}

// MARK: - Cartes neuves / en apprentissage / en relearning (étapes en minutes)

function reviewLearningPhase(
  card: SM2CardState,
  grade: SM2Grade,
  now: Date,
  config: SM2Config,
  isRelearning: boolean
): SM2CardState {
  let next: SM2CardState = { ...card };
  const steps = isRelearning ? config.relearningStepsMinutes : config.learningStepsMinutes;

  switch (grade) {
    case 'again':
      next.learningStepIndex = 0;
      next.lifecycle = isRelearning ? 'relearning' : 'learning';
      next.dueDate = addMinutes(now, steps[0] ?? 0);
      break;

    case 'hard': {
      next.lifecycle = isRelearning ? 'relearning' : 'learning';
      const index = Math.min(card.learningStepIndex, steps.length - 1);
      next.dueDate = addMinutes(now, steps.length === 0 ? 0 : steps[index]);
      break;
    }

    case 'good': {
      const nextIndex = card.learningStepIndex + 1;
      if (nextIndex < steps.length) {
        next.learningStepIndex = nextIndex;
        next.lifecycle = isRelearning ? 'relearning' : 'learning';
        next.dueDate = addMinutes(now, steps[nextIndex]);
      } else {
        next = graduate(
          next,
          now,
          config,
          isRelearning,
          isRelearning ? card.intervalDays : config.graduatingIntervalDays
        );
      }
      break;
    }

    case 'easy':
      next = graduate(
        next,
        now,
        config,
        isRelearning,
        isRelearning ? card.intervalDays : config.easyGraduatingIntervalDays
      );
      if (!isRelearning) {
        next.easeFactor = Math.max(config.minimumEaseFactor, next.easeFactor + config.easyEaseDelta);
      }
      break;
  }

  return next;
}

function graduate(
  card: SM2CardState,
  now: Date,
  config: SM2Config,
  isRelearning: boolean,
  interval: number
): SM2CardState {
  const clampedInterval = Math.max(config.minimumIntervalDays, interval);
  return {
    ...card,
    lifecycle: 'review',
    learningStepIndex: 0,
    intervalDays: clampedInterval,
    repetitions: isRelearning ? card.repetitions : card.repetitions + 1,
    dueDate: addDays(now, clampedInterval),
  };
}

// MARK: - Cartes en review (intervalles en jours)

function reviewReviewPhase(card: SM2CardState, grade: SM2Grade, now: Date, config: SM2Config): SM2CardState {
  const next: SM2CardState = { ...card };

  switch (grade) {
    case 'again': {
      next.lapses += 1;
      next.easeFactor = Math.max(config.minimumEaseFactor, card.easeFactor + config.againEaseDelta);
      const lapsedInterval = Math.max(config.minimumIntervalDays, card.intervalDays * config.lapseNewIntervalPercent);
      next.intervalDays = lapsedInterval;
      next.lifecycle = 'relearning';
      next.learningStepIndex = 0;
      const firstStep = config.relearningStepsMinutes[0] ?? 0;
      next.dueDate = addMinutes(now, firstStep);
      break;
    }

    case 'hard': {
      next.easeFactor = Math.max(config.minimumEaseFactor, card.easeFactor + config.hardEaseDelta);
      const candidate = card.intervalDays * config.hardIntervalMultiplier;
      next.intervalDays = Math.max(candidate, card.intervalDays + config.minimumIntervalDays);
      next.repetitions += 1;
      next.dueDate = addDays(now, next.intervalDays);
      break;
    }

    case 'good':
      next.intervalDays = Math.max(config.minimumIntervalDays, card.intervalDays * card.easeFactor);
      next.repetitions += 1;
      next.dueDate = addDays(now, next.intervalDays);
      break;

    case 'easy':
      next.easeFactor = card.easeFactor + config.easyEaseDelta;
      next.intervalDays = Math.max(config.minimumIntervalDays, card.intervalDays * card.easeFactor * config.easyBonus);
      next.repetitions += 1;
      next.dueDate = addDays(now, next.intervalDays);
      break;
  }

  return next;
}
