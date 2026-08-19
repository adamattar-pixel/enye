import Foundation

/// The scheduling lifecycle a card moves through, mirroring Anki's model:
/// a brand new card first walks through `learning` steps (short,
/// minute-scale delays) before it "graduates" into `review` (day-scale
/// spaced intervals). A failed review demotes a `review` card into
/// `relearning`, a smaller set of learning-style steps, before it
/// re-enters `review`.
public enum SM2CardLifecycle: String, Equatable, Sendable {
    case new
    case learning
    case review
    case relearning
}

/// The full scheduling state of one card, independent of any storage
/// layer (SwiftData, etc). `SM2Engine.review` is a pure function from
/// one `SM2CardState` + a grade to the next `SM2CardState`.
public struct SM2CardState: Equatable, Sendable {
    /// SuperMemo "ease factor": how much the interval multiplies on a
    /// "Bien" review. Starts at 2.5, never drops below `SM2Config.minimumEaseFactor`.
    public var easeFactor: Double

    /// Current review interval, in days. Only meaningful once the card
    /// has graduated to `.review` at least once; ignored while `.new`,
    /// `.learning` or `.relearning` (those are scheduled in minutes via
    /// `learningStepIndex`).
    public var intervalDays: Double

    /// Number of times this card has been graded while in `.review` state.
    public var repetitions: Int

    /// Number of times this card has lapsed (graded "Otra vez" while in `.review`).
    public var lapses: Int

    /// Index into the active step list (`SM2Config.learningStepsMinutes`
    /// or `.relearningStepsMinutes`) while in `.learning` / `.relearning`.
    public var learningStepIndex: Int

    /// Where this card currently sits in its lifecycle.
    public var lifecycle: SM2CardLifecycle

    /// The next moment this card should be presented to the learner.
    public var dueDate: Date

    public init(
        easeFactor: Double = 2.5,
        intervalDays: Double = 0,
        repetitions: Int = 0,
        lapses: Int = 0,
        learningStepIndex: Int = 0,
        lifecycle: SM2CardLifecycle = .new,
        dueDate: Date = .now
    ) {
        self.easeFactor = easeFactor
        self.intervalDays = intervalDays
        self.repetitions = repetitions
        self.lapses = lapses
        self.learningStepIndex = learningStepIndex
        self.lifecycle = lifecycle
        self.dueDate = dueDate
    }
}
