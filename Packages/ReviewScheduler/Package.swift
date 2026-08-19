// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ReviewScheduler",
    products: [
        .library(name: "ReviewScheduler", targets: ["ReviewScheduler"])
    ],
    targets: [
        .target(name: "ReviewScheduler"),
        .testTarget(name: "ReviewSchedulerTests", dependencies: ["ReviewScheduler"])
    ]
)
