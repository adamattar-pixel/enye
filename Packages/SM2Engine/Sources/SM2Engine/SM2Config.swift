/// Tunable constants for the scheduling algorithm. Defaults match Anki's
/// own SM-2 defaults, since the spec calls for "the real Anki SM-2, not
/// a simplified homemade version".
public struct SM2Config: Equatable, Sendable {
    public var minimumEaseFactor: Double
    public var easyBonus: Double
    public var hardIntervalMultiplier: Double

    /// Ease factor deltas applied when a `.review` card is graded.
    public var againEaseDelta: Double
    public var hardEaseDelta: Double
    public var easyEaseDelta: Double

    /// Delays, in minutes, a new/learning card walks through before
    /// graduating to `.review`. Anki's default is [1, 10].
    public var learningStepsMinutes: [Double]

    /// Delays, in minutes, a lapsed card walks through before
    /// re-entering `.review`. Anki's default is [10].
    public var relearningStepsMinutes: [Double]

    /// Interval, in days, granted on graduating via "Bien".
    public var graduatingIntervalDays: Double

    /// Interval, in days, granted on graduating immediately via "Fácil".
    public var easyGraduatingIntervalDays: Double

    /// Fraction of the pre-lapse interval kept once a card finishes
    /// relearning. Anki's default is 0% (start over), floored at
    /// `minimumIntervalDays`.
    public var lapseNewIntervalPercent: Double

    /// Smallest interval, in days, a `.review` card can ever be given.
    public var minimumIntervalDays: Double

    public static let anki = SM2Config(
        minimumEaseFactor: 1.3,
        easyBonus: 1.3,
        hardIntervalMultiplier: 1.2,
        againEaseDelta: -0.20,
        hardEaseDelta: -0.15,
        easyEaseDelta: 0.15,
        learningStepsMinutes: [1, 10],
        relearningStepsMinutes: [10],
        graduatingIntervalDays: 1,
        easyGraduatingIntervalDays: 4,
        lapseNewIntervalPercent: 0.0,
        minimumIntervalDays: 1
    )

    public init(
        minimumEaseFactor: Double,
        easyBonus: Double,
        hardIntervalMultiplier: Double,
        againEaseDelta: Double,
        hardEaseDelta: Double,
        easyEaseDelta: Double,
        learningStepsMinutes: [Double],
        relearningStepsMinutes: [Double],
        graduatingIntervalDays: Double,
        easyGraduatingIntervalDays: Double,
        lapseNewIntervalPercent: Double,
        minimumIntervalDays: Double
    ) {
        self.minimumEaseFactor = minimumEaseFactor
        self.easyBonus = easyBonus
        self.hardIntervalMultiplier = hardIntervalMultiplier
        self.againEaseDelta = againEaseDelta
        self.hardEaseDelta = hardEaseDelta
        self.easyEaseDelta = easyEaseDelta
        self.learningStepsMinutes = learningStepsMinutes
        self.relearningStepsMinutes = relearningStepsMinutes
        self.graduatingIntervalDays = graduatingIntervalDays
        self.easyGraduatingIntervalDays = easyGraduatingIntervalDays
        self.lapseNewIntervalPercent = lapseNewIntervalPercent
        self.minimumIntervalDays = minimumIntervalDays
    }
}
