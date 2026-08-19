// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SM2Engine",
    products: [
        .library(name: "SM2Engine", targets: ["SM2Engine"])
    ],
    targets: [
        .target(name: "SM2Engine"),
        .testTarget(name: "SM2EngineTests", dependencies: ["SM2Engine"])
    ]
)
