import SwiftUI

// Design tokens, mirrored from the web (src/styles/tokens.css).
extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        let r, g, b: Double
        if s.count == 6 {
            r = Double((v >> 16) & 0xff) / 255
            g = Double((v >> 8) & 0xff) / 255
            b = Double(v & 0xff) / 255
        } else {
            r = 0; g = 0; b = 0
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}

enum Theme {
    static let void = Color(hex: "06080B")
    static let panel = Color(hex: "0C0F15")
    static let rule = Color(hex: "171C25")
    static let rule2 = Color(hex: "232B37")
    static let txt = Color(hex: "DCE2EC")
    static let dim = Color(hex: "6E7889")
    static let dim2 = Color(hex: "454D5C")
    static let signal = Color(hex: "8FD6E6")
    static let delay = Color(hex: "E5B571")
    static let dead = Color(hex: "3B4250")
    static let star = Color(hex: "AEB9CC")
    static let planet = Color(hex: "5A6678")

    static let mono = "Roboto Mono"
    static let sans = "Stack Sans Notch"
}

// Typography — reference bundled fonts by their PostScript names.
extension Font {
    static func mono(_ size: CGFloat) -> Font { .custom("RobotoMono-Regular", size: size) }
    static func monoMed(_ size: CGFloat) -> Font { .custom("RobotoMono-Medium", size: size) }
    static func monoBold(_ size: CGFloat) -> Font { .custom("RobotoMono-Bold", size: size) }
    static func title(_ size: CGFloat) -> Font { .custom("StackSansNotch-Regular", size: size) }
    static func titleSemi(_ size: CGFloat) -> Font { .custom("StackSansNotch-SemiBold", size: size) }
    static func titleBold(_ size: CGFloat) -> Font { .custom("StackSansNotch-Bold", size: size) }
}
