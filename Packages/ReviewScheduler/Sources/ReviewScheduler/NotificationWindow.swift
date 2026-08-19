/// The daily time-of-day window during which notifications are allowed to
/// fire, and the spacing to leave between two consecutive ones. Assumes a
/// same-day window (`startHour` before `endHour`) — this project's window
/// is 8h–22h, it never crosses midnight.
public struct NotificationWindow: Equatable, Sendable {
    public var startHour: Int
    public var startMinute: Int
    public var endHour: Int
    public var endMinute: Int

    /// Smallest gap, in minutes, ever left between two consecutive
    /// notifications on the same day.
    public var minSpacingMinutes: Double

    /// Largest gap, in minutes, a caller's spacing generator is expected
    /// to produce. Not enforced by the scheduler itself (it only ever
    /// uses whatever `nextSpacingMinutes` returns) — kept here so the
    /// window fully describes the policy in one place.
    public var maxSpacingMinutes: Double

    public init(
        startHour: Int,
        startMinute: Int = 0,
        endHour: Int,
        endMinute: Int = 0,
        minSpacingMinutes: Double,
        maxSpacingMinutes: Double
    ) {
        self.startHour = startHour
        self.startMinute = startMinute
        self.endHour = endHour
        self.endMinute = endMinute
        self.minSpacingMinutes = minSpacingMinutes
        self.maxSpacingMinutes = maxSpacingMinutes
    }

    /// Lexis's validated defaults: 8h–22h, 15 to 30 minutes between cards.
    public static let lexisDefault = NotificationWindow(
        startHour: 8,
        endHour: 22,
        minSpacingMinutes: 15,
        maxSpacingMinutes: 30
    )
}
