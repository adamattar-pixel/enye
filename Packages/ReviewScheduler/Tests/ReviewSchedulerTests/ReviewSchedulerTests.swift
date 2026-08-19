import XCTest
@testable import ReviewScheduler

final class ReviewSchedulerTests: XCTestCase {
    var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }

    func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int, _ min: Int) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    let window = NotificationWindow(startHour: 8, endHour: 22, minSpacingMinutes: 15, maxSpacingMinutes: 30)

    // MARK: - Basic placement

    func testEmptyItemsProducesEmptySchedule() {
        let result = ReviewScheduler.schedule(items: [], window: window, startingFrom: date(2026, 8, 19, 9, 0), calendar: calendar) { 15 }
        XCTAssertTrue(result.isEmpty)
    }

    func testItemsWithinCapacityStaySameDayAtFixedSpacing() {
        let items = (0..<5).map { DueItem(id: "card\($0)", dueDate: date(2026, 8, 19, 8, 0).addingTimeInterval(Double($0) * 60)) }
        let result = ReviewScheduler.schedule(items: items, window: window, startingFrom: date(2026, 8, 19, 8, 0), calendar: calendar) { 15 }

        XCTAssertEqual(result.count, 5)
        for (index, slot) in result.enumerated() {
            let expected = date(2026, 8, 19, 8, 0).addingTimeInterval(Double(index) * 15 * 60)
            XCTAssertEqual(slot.fireDate, expected)
        }
    }

    func testSortedByDueDateRegardlessOfInputOrder() {
        let items = [
            DueItem(id: "newest", dueDate: date(2026, 8, 19, 10, 0)),
            DueItem(id: "oldest", dueDate: date(2026, 8, 18, 9, 0)),
            DueItem(id: "middle", dueDate: date(2026, 8, 19, 8, 0))
        ]
        let result = ReviewScheduler.schedule(items: items, window: window, startingFrom: date(2026, 8, 19, 8, 0), calendar: calendar) { 15 }

        XCTAssertEqual(result.map(\.id), ["oldest", "middle", "newest"])
    }

    // MARK: - Window clamping

    func testNowBeforeWindowStartUsesWindowStart() {
        let items = [DueItem(id: "card0", dueDate: date(2026, 8, 19, 6, 0))]
        let result = ReviewScheduler.schedule(items: items, window: window, startingFrom: date(2026, 8, 19, 6, 0), calendar: calendar) { 15 }

        XCTAssertEqual(result.first?.fireDate, date(2026, 8, 19, 8, 0))
    }

    func testNowAfterWindowEndRollsToNextDayWindowStart() {
        let items = [DueItem(id: "card0", dueDate: date(2026, 8, 19, 23, 0))]
        let result = ReviewScheduler.schedule(items: items, window: window, startingFrom: date(2026, 8, 19, 23, 0), calendar: calendar) { 15 }

        XCTAssertEqual(result.first?.fireDate, date(2026, 8, 20, 8, 0))
    }

    // MARK: - The defensive overflow rule

    func testOverflowSpillsToNextDayInsteadOfCompressingSpacing() {
        // 1h window (8h-9h), 20 min spacing -> 4 slots/day (8:00, 8:20, 8:40, 9:00).
        let tightWindow = NotificationWindow(startHour: 8, endHour: 9, minSpacingMinutes: 20, maxSpacingMinutes: 20)
        let items = (0..<5).map { DueItem(id: "card\($0)", dueDate: date(2026, 8, 19, 8, 0)) }

        let result = ReviewScheduler.schedule(items: items, window: tightWindow, startingFrom: date(2026, 8, 19, 8, 0), calendar: calendar) { 20 }

        XCTAssertEqual(result.count, 5)
        XCTAssertEqual(result[0].fireDate, date(2026, 8, 19, 8, 0))
        XCTAssertEqual(result[1].fireDate, date(2026, 8, 19, 8, 20))
        XCTAssertEqual(result[2].fireDate, date(2026, 8, 19, 8, 40))
        XCTAssertEqual(result[3].fireDate, date(2026, 8, 19, 9, 0))
        // The 5th card doesn't fit before 9:00 -> spills to tomorrow's window start,
        // never compressed to squeeze in before 9:00.
        XCTAssertEqual(result[4].fireDate, date(2026, 8, 20, 8, 0))
    }

    func testOverflowAcrossMultipleDays() {
        let tightWindow = NotificationWindow(startHour: 8, endHour: 8, minSpacingMinutes: 30, maxSpacingMinutes: 30)
        // A zero-length window (8h-8h) means exactly 1 slot/day.
        let items = (0..<3).map { DueItem(id: "card\($0)", dueDate: date(2026, 8, 19, 8, 0)) }

        let result = ReviewScheduler.schedule(items: items, window: tightWindow, startingFrom: date(2026, 8, 19, 8, 0), calendar: calendar) { 30 }

        XCTAssertEqual(result.map(\.fireDate), [
            date(2026, 8, 19, 8, 0),
            date(2026, 8, 20, 8, 0),
            date(2026, 8, 21, 8, 0)
        ])
    }

    func testSpacingIsNeverCompressedBelowWhatTheGeneratorReturns() {
        let items = (0..<3).map { DueItem(id: "card\($0)", dueDate: date(2026, 8, 19, 8, 0)) }
        let result = ReviewScheduler.schedule(items: items, window: window, startingFrom: date(2026, 8, 19, 8, 0), calendar: calendar) { 30 }

        XCTAssertEqual(result[1].fireDate.timeIntervalSince(result[0].fireDate), 30 * 60)
        XCTAssertEqual(result[2].fireDate.timeIntervalSince(result[1].fireDate), 30 * 60)
    }

    func testLexisSettingsAFitsComfortablyWithinOneDay() {
        // Réglages retenus : 8 nouvelles + 22 révisions = 30 cartes/jour.
        let items = (0..<30).map { DueItem(id: "card\($0)", dueDate: date(2026, 8, 19, 7, 0)) }
        let result = ReviewScheduler.schedule(items: items, window: window, startingFrom: date(2026, 8, 19, 8, 0), calendar: calendar) { 22.5 }

        let allSameDay = result.allSatisfy { calendar.isDate($0.fireDate, inSameDayAs: date(2026, 8, 19, 0, 0)) }
        XCTAssertTrue(allSameDay, "30 cartes/jour à un espacement moyen de 22,5 min doivent tenir dans la fenêtre 8h-22h (capacité ~37).")
    }
}
