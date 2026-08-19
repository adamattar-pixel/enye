import XCTest
@testable import SM2Engine

final class SM2EngineTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_700_000_000)

    // MARK: - New card, learning steps

    func testNewCardAgainStaysOnFirstLearningStep() {
        let card = SM2CardState(lifecycle: .new, dueDate: now)
        let next = SM2Engine.review(card, grade: .again, now: now)

        XCTAssertEqual(next.lifecycle, .learning)
        XCTAssertEqual(next.learningStepIndex, 0)
        XCTAssertEqual(next.dueDate, now.addingTimeInterval(60)) // 1 minute
    }

    func testNewCardGoodAdvancesToSecondLearningStep() {
        let card = SM2CardState(lifecycle: .new, dueDate: now)
        let next = SM2Engine.review(card, grade: .good, now: now)

        XCTAssertEqual(next.lifecycle, .learning)
        XCTAssertEqual(next.learningStepIndex, 1)
        XCTAssertEqual(next.dueDate, now.addingTimeInterval(600)) // 10 minutes
    }

    func testCardGraduatesAfterFinalLearningStepGood() {
        let card = SM2CardState(learningStepIndex: 1, lifecycle: .learning, dueDate: now)
        let next = SM2Engine.review(card, grade: .good, now: now)

        XCTAssertEqual(next.lifecycle, .review)
        XCTAssertEqual(next.intervalDays, 1)
        XCTAssertEqual(next.repetitions, 1)
        XCTAssertEqual(next.dueDate, now.addingTimeInterval(24 * 60 * 60))
    }

    func testNewCardEasyGraduatesImmediatelyWithLongerIntervalAndEaseBump() {
        let card = SM2CardState(lifecycle: .new, dueDate: now)
        let next = SM2Engine.review(card, grade: .easy, now: now)

        XCTAssertEqual(next.lifecycle, .review)
        XCTAssertEqual(next.intervalDays, 4)
        XCTAssertEqual(next.repetitions, 1)
        XCTAssertEqual(next.easeFactor, 2.65, accuracy: 0.0001) // 2.5 + 0.15
        XCTAssertEqual(next.dueDate, now.addingTimeInterval(4 * 24 * 60 * 60))
    }

    func testHardRepeatsCurrentLearningStepWithoutAdvancing() {
        let card = SM2CardState(learningStepIndex: 0, lifecycle: .learning, dueDate: now)
        let next = SM2Engine.review(card, grade: .hard, now: now)

        XCTAssertEqual(next.lifecycle, .learning)
        XCTAssertEqual(next.learningStepIndex, 0)
        XCTAssertEqual(next.dueDate, now.addingTimeInterval(60))
    }

    // MARK: - Review phase

    func testReviewGoodMultipliesIntervalByEase() {
        let card = SM2CardState(easeFactor: 2.5, intervalDays: 6, repetitions: 2, lifecycle: .review, dueDate: now)
        let next = SM2Engine.review(card, grade: .good, now: now)

        XCTAssertEqual(next.intervalDays, 15) // 6 * 2.5
        XCTAssertEqual(next.easeFactor, 2.5) // unchanged on "Bien"
        XCTAssertEqual(next.repetitions, 3)
        XCTAssertEqual(next.lifecycle, .review)
    }

    func testReviewHardAppliesSmallerMultiplierAndLowersEase() {
        let card = SM2CardState(easeFactor: 2.5, intervalDays: 10, repetitions: 2, lifecycle: .review, dueDate: now)
        let next = SM2Engine.review(card, grade: .hard, now: now)

        XCTAssertEqual(next.intervalDays, 12) // 10 * 1.2
        XCTAssertEqual(next.easeFactor, 2.35, accuracy: 0.0001) // 2.5 - 0.15
        XCTAssertEqual(next.lifecycle, .review)
    }

    func testReviewEasyAppliesEasyBonusAndRaisesEase() {
        let card = SM2CardState(easeFactor: 2.5, intervalDays: 10, repetitions: 2, lifecycle: .review, dueDate: now)
        let next = SM2Engine.review(card, grade: .easy, now: now)

        XCTAssertEqual(next.intervalDays, 32.5, accuracy: 0.0001) // 10 * 2.5 * 1.3
        XCTAssertEqual(next.easeFactor, 2.65, accuracy: 0.0001) // 2.5 + 0.15
    }

    func testReviewAgainLapsesIntoRelearningAndResetsInterval() {
        let card = SM2CardState(easeFactor: 2.5, intervalDays: 20, repetitions: 5, lapses: 0, lifecycle: .review, dueDate: now)
        let next = SM2Engine.review(card, grade: .again, now: now)

        XCTAssertEqual(next.lifecycle, .relearning)
        XCTAssertEqual(next.lapses, 1)
        XCTAssertEqual(next.easeFactor, 2.3, accuracy: 0.0001) // 2.5 - 0.20
        XCTAssertEqual(next.intervalDays, 1) // floored at minimumIntervalDays, 20 * 0% = 0
        XCTAssertEqual(next.dueDate, now.addingTimeInterval(600)) // 10-minute relearning step
        XCTAssertEqual(next.repetitions, 5) // untouched by a lapse
    }

    func testEaseFactorNeverDropsBelowMinimum() {
        var card = SM2CardState(easeFactor: 1.35, intervalDays: 5, lifecycle: .review, dueDate: now)
        for _ in 0..<5 {
            card = SM2Engine.review(card, grade: .again, now: now)
            card.lifecycle = .review // simulate instantly graduating relearning for this stress test
        }
        XCTAssertGreaterThanOrEqual(card.easeFactor, 1.3)
    }

    func testHardIntervalNeverShrinksEvenAtLowEase() {
        let card = SM2CardState(easeFactor: 1.3, intervalDays: 1, lifecycle: .review, dueDate: now)
        let next = SM2Engine.review(card, grade: .hard, now: now)

        XCTAssertGreaterThan(next.intervalDays, card.intervalDays)
    }

    // MARK: - Relearning phase (post-lapse)

    func testRelearningGoodOnLastStepReturnsToReviewWithPreservedPostLapseInterval() {
        let card = SM2CardState(easeFactor: 2.3, intervalDays: 4, learningStepIndex: 0, lifecycle: .relearning, dueDate: now)
        let next = SM2Engine.review(card, grade: .good, now: now)

        XCTAssertEqual(next.lifecycle, .review)
        XCTAssertEqual(next.intervalDays, 4) // the interval computed at lapse time, untouched here
        XCTAssertEqual(next.dueDate, now.addingTimeInterval(4 * 24 * 60 * 60))
    }

    func testRelearningAgainRestartsRelearningSteps() {
        let card = SM2CardState(learningStepIndex: 0, lifecycle: .relearning, dueDate: now)
        let next = SM2Engine.review(card, grade: .again, now: now)

        XCTAssertEqual(next.lifecycle, .relearning)
        XCTAssertEqual(next.learningStepIndex, 0)
        XCTAssertEqual(next.dueDate, now.addingTimeInterval(600))
    }
}
