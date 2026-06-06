// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "LynkOSCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "LynkOSCore", targets: ["LynkOSCore"]),
    ],
    targets: [
        .target(name: "LynkOSCore"),
    ]
)
