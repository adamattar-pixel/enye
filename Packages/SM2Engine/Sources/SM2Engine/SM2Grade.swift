/// One of the four ratings a learner can give a card after reviewing it.
///
/// Maps to the UI's Spanish button labels: `.again` = "Otra vez",
/// `.hard` = "Difícil", `.good` = "Bien", `.easy` = "Fácil". The engine
/// stays language-agnostic; the labels live in the UI layer only.
public enum SM2Grade: String, Equatable, Sendable, CaseIterable {
    case again
    case hard
    case good
    case easy
}
