import Foundation

/// One card waiting for a notification slot, identified by its SwiftData
/// card id and the moment SM2Engine says it became due. Ordering by
/// `dueDate` is what "traité par ordre d'échéance" means throughout this
/// module — the longer a card has been waiting, the earlier it gets a slot.
public struct DueItem: Equatable, Sendable {
    public var id: String
    public var dueDate: Date

    public init(id: String, dueDate: Date) {
        self.id = id
        self.dueDate = dueDate
    }
}

/// One card with an actual notification fire date assigned to it.
public struct ScheduledNotification: Equatable, Sendable {
    public var id: String
    public var fireDate: Date

    public init(id: String, fireDate: Date) {
        self.id = id
        self.fireDate = fireDate
    }
}
