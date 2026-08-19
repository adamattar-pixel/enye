import Foundation

/// Pure scheduling logic: given a card's current state, a grade, and
/// "now", returns the card's next state. No I/O, no persistence — this
/// makes it trivial to unit test every transition and safe to reuse
/// from the SwiftData layer without coupling the two.
public enum SM2Engine {
    public static func review(
        _ card: SM2CardState,
        grade: SM2Grade,
        now: Date = .now,
        config: SM2Config = .anki
    ) -> SM2CardState {
        switch card.lifecycle {
        case .new, .learning:
            return reviewLearningPhase(card, grade: grade, now: now, config: config, isRelearning: false)
        case .relearning:
            return reviewLearningPhase(card, grade: grade, now: now, config: config, isRelearning: true)
        case .review:
            return reviewReviewPhase(card, grade: grade, now: now, config: config)
        }
    }

    // MARK: - New / learning / relearning cards (minute-scale steps)

    private static func reviewLearningPhase(
        _ card: SM2CardState,
        grade: SM2Grade,
        now: Date,
        config: SM2Config,
        isRelearning: Bool
    ) -> SM2CardState {
        var next = card
        let steps = isRelearning ? config.relearningStepsMinutes : config.learningStepsMinutes

        switch grade {
        case .again:
            next.learningStepIndex = 0
            next.lifecycle = isRelearning ? .relearning : .learning
            next.dueDate = now.addingTimeInterval(minutes: steps.first ?? 0)

        case .hard:
            next.lifecycle = isRelearning ? .relearning : .learning
            let index = min(card.learningStepIndex, steps.count - 1)
            next.dueDate = now.addingTimeInterval(minutes: steps.isEmpty ? 0 : steps[index])

        case .good:
            let nextIndex = card.learningStepIndex + 1
            if nextIndex < steps.count {
                next.learningStepIndex = nextIndex
                next.lifecycle = isRelearning ? .relearning : .learning
                next.dueDate = now.addingTimeInterval(minutes: steps[nextIndex])
            } else {
                next = graduate(next, now: now, config: config, isRelearning: isRelearning, interval: isRelearning ? card.intervalDays : config.graduatingIntervalDays)
            }

        case .easy:
            next = graduate(next, now: now, config: config, isRelearning: isRelearning, interval: isRelearning ? card.intervalDays : config.easyGraduatingIntervalDays)
            if !isRelearning {
                next.easeFactor = max(config.minimumEaseFactor, next.easeFactor + config.easyEaseDelta)
            }
        }

        return next
    }

    private static func graduate(
        _ card: SM2CardState,
        now: Date,
        config: SM2Config,
        isRelearning: Bool,
        interval: Double
    ) -> SM2CardState {
        var next = card
        next.lifecycle = .review
        next.learningStepIndex = 0
        let clampedInterval = max(config.minimumIntervalDays, interval)
        next.intervalDays = clampedInterval
        next.repetitions = isRelearning ? card.repetitions : card.repetitions + 1
        next.dueDate = now.addingTimeInterval(days: clampedInterval)
        return next
    }

    // MARK: - Review-state cards (day-scale intervals)

    private static func reviewReviewPhase(
        _ card: SM2CardState,
        grade: SM2Grade,
        now: Date,
        config: SM2Config
    ) -> SM2CardState {
        var next = card

        switch grade {
        case .again:
            next.lapses += 1
            next.easeFactor = max(config.minimumEaseFactor, card.easeFactor + config.againEaseDelta)
            let lapsedInterval = max(config.minimumIntervalDays, card.intervalDays * config.lapseNewIntervalPercent)
            next.intervalDays = lapsedInterval
            next.lifecycle = .relearning
            next.learningStepIndex = 0
            let firstStep = config.relearningStepsMinutes.first ?? 0
            next.dueDate = now.addingTimeInterval(minutes: firstStep)

        case .hard:
            next.easeFactor = max(config.minimumEaseFactor, card.easeFactor + config.hardEaseDelta)
            let candidate = card.intervalDays * config.hardIntervalMultiplier
            next.intervalDays = max(candidate, card.intervalDays + config.minimumIntervalDays)
            next.repetitions += 1
            next.dueDate = now.addingTimeInterval(days: next.intervalDays)

        case .good:
            next.intervalDays = max(config.minimumIntervalDays, card.intervalDays * card.easeFactor)
            next.repetitions += 1
            next.dueDate = now.addingTimeInterval(days: next.intervalDays)

        case .easy:
            next.easeFactor = card.easeFactor + config.easyEaseDelta
            next.intervalDays = max(config.minimumIntervalDays, card.intervalDays * card.easeFactor * config.easyBonus)
            next.repetitions += 1
            next.dueDate = now.addingTimeInterval(days: next.intervalDays)
        }

        return next
    }
}

private extension Date {
    func addingTimeInterval(minutes: Double) -> Date {
        addingTimeInterval(minutes * 60)
    }

    func addingTimeInterval(days: Double) -> Date {
        addingTimeInterval(days * 24 * 60 * 60)
    }
}
