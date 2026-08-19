import Foundation

/// Turns a list of due cards into actual notification fire dates, without
/// ever exceeding the local-notification-friendly capacity of one day's
/// window. This is the defensive rule from the Lexis settings audit: 15
/// nouvelles + 80 révisions (95 cartes/jour) don't fit in a 14h window
/// spaced 15-30 min apart (~28-56 créneaux selon le tirage) — rather than
/// silently compressing the spacing to cram everything in, the excess
/// spills over to the next day's window, still respecting the minimum
/// spacing and still ordered oldest-due-first.
///
/// Pure function: no I/O, no `UNUserNotificationCenter`. The app layer is
/// responsible for turning `ScheduledNotification`s into actual
/// `UNNotificationRequest`s.
public enum ReviewScheduler {
    /// - Parameters:
    ///   - items: cards waiting for a slot, in any order.
    ///   - window: the daily time-of-day window and spacing policy.
    ///   - now: the moment scheduling is being computed from (usually `.now`).
    ///   - calendar: injected for testability; defaults to the current calendar.
    ///   - nextSpacingMinutes: called once per item (after the first) to decide
    ///     how far past the previous slot the next one lands. Required rather
    ///     than defaulted, so callers always make an explicit choice — e.g.
    ///     `{ Double.random(in: window.minSpacingMinutes...window.maxSpacingMinutes) }`
    ///     in the app, or a fixed value in tests for determinism.
    public static func schedule(
        items: [DueItem],
        window: NotificationWindow,
        startingFrom now: Date,
        calendar: Calendar = .current,
        nextSpacingMinutes: () -> Double
    ) -> [ScheduledNotification] {
        let sorted = items.sorted { $0.dueDate < $1.dueDate }
        var cursor = now
        var results: [ScheduledNotification] = []
        results.reserveCapacity(sorted.count)

        for item in sorted {
            cursor = firstAvailableSlot(onOrAfter: cursor, window: window, calendar: calendar)
            results.append(ScheduledNotification(id: item.id, fireDate: cursor))
            cursor = cursor.addingTimeInterval(nextSpacingMinutes() * 60)
        }

        return results
    }

    /// The earliest moment at or after `date` that falls inside the
    /// window: `date` itself if already inside today's window, today's
    /// window start if `date` is too early, or tomorrow's window start
    /// if `date` is past today's window end (this is the "spill to the
    /// next day" behavior).
    static func firstAvailableSlot(onOrAfter date: Date, window: NotificationWindow, calendar: Calendar) -> Date {
        let start = windowStart(on: date, window: window, calendar: calendar)
        let end = windowEnd(on: date, window: window, calendar: calendar)

        if date < start {
            return start
        }
        if date > end {
            let nextDay = calendar.date(byAdding: .day, value: 1, to: date)!
            return windowStart(on: nextDay, window: window, calendar: calendar)
        }
        return date
    }

    private static func windowStart(on date: Date, window: NotificationWindow, calendar: Calendar) -> Date {
        calendar.date(bySettingHour: window.startHour, minute: window.startMinute, second: 0, of: date)!
    }

    private static func windowEnd(on date: Date, window: NotificationWindow, calendar: Calendar) -> Date {
        calendar.date(bySettingHour: window.endHour, minute: window.endMinute, second: 0, of: date)!
    }
}
