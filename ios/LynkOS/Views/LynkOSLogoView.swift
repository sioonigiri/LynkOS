import SwiftUI

struct LynkOSLogoView: View {
    var body: some View {
        HStack(spacing: 10) {
            LynkOSHexIcon()
                .frame(width: 28, height: 28)
            Text("LynkOS")
                .font(.system(size: 20, weight: .bold))
                .tracking(1)
                .foregroundStyle(LynkOSTheme.text)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("LynkOS")
    }
}

private struct LynkOSHexIcon: View {
    var body: some View {
        ZStack {
            HexagonShape()
                .stroke(LynkOSTheme.accent, lineWidth: 2)
            Circle()
                .fill(LynkOSTheme.accent)
                .frame(width: 8, height: 8)
        }
    }
}

private struct HexagonShape: Shape {
    func path(in rect: CGRect) -> Path {
        let w = rect.width
        let h = rect.height
        let cx = rect.midX
        let points: [CGPoint] = [
            CGPoint(x: cx, y: 0),
            CGPoint(x: w, y: h * 0.25),
            CGPoint(x: w, y: h * 0.75),
            CGPoint(x: cx, y: h),
            CGPoint(x: 0, y: h * 0.75),
            CGPoint(x: 0, y: h * 0.25),
        ]
        var path = Path()
        path.addLines(points)
        path.closeSubpath()
        return path
    }
}

#Preview {
    LynkOSLogoView()
        .padding()
        .background(LynkOSTheme.background)
}
