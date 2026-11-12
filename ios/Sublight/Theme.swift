import SwiftUI

// Design tokens, mirrored from the web (src/styles/tokens.css, src/map/palette.ts).
// The brand itself is described in docs/brand.md.
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
    // Surfaces: true black, then three neutral lifts. No blue cast.
    static let void = Color(hex: "000000")
    static let panel = Color(hex: "0B0B0D")
    static let panel2 = Color(hex: "131316")
    static let panel3 = Color(hex: "1B1B1F")
    // Hairlines are light over the surface, so they read the same everywhere.
    static let rule = Color.white.opacity(0.08)
    static let rule2 = Color.white.opacity(0.14)
    // Text: primary, secondary, tertiary.
    static let txt = Color(hex: "F5F5F7")
    static let dim = Color(hex: "9D9DA5")
    static let dim2 = Color(hex: "67676F")

    static let signal = Color(hex: "74D4F0")   // active, interactive, selected
    static let delay = Color(hex: "F2B766")    // RESERVED: light-time values + imaging craft only
    static let dead = Color(hex: "3C3C43")     // silent / retired
    static let alert = Color(hex: "FF7A66")    // storm-level space weather only

    // Map-only neutrals (src/map/palette.ts).
    static let star = Color(hex: "C9CDD6")
    static let planet = Color(hex: "6A6A74")
    static let faint = Color(hex: "2C2C33")

    // Glass for chrome that floats over content; solid panels hold content.
    static let glass = Color(red: 22 / 255, green: 22 / 255, blue: 26 / 255).opacity(0.7)
    static let glassStrong = Color(red: 14 / 255, green: 14 / 255, blue: 17 / 255).opacity(0.88)

    // Radii: chips, thumbnails, cards, panels.
    static let rXS: CGFloat = 6
    static let rS: CGFloat = 10
    static let rM: CGFloat = 14
    static let rL: CGFloat = 22
}

// Typography. Stack Sans Notch for titles, Geist for everything else people
// read, Geist Mono only for what an instrument measured. PostScript names.
extension Font {
    // Values: numbers, units, timestamps, counts, coordinates.
    static func mono(_ size: CGFloat) -> Font { .custom("GeistMono-Regular", size: size) }
    static func monoMed(_ size: CGFloat) -> Font { .custom("GeistMono-Medium", size: size) }
    static func monoBold(_ size: CGFloat) -> Font { .custom("GeistMono-SemiBold", size: size) }
    // Titles and craft names: Stack Sans Notch, the brand's display face.
    static func title(_ size: CGFloat) -> Font { .custom("StackSansNotch-Regular", size: size) }
    static func titleSemi(_ size: CGFloat) -> Font { .custom("StackSansNotch-SemiBold", size: size) }
    static func titleBold(_ size: CGFloat) -> Font { .custom("StackSansNotch-Bold", size: size) }
    // Reading text: body, buttons, descriptions, legends.
    static func sans(_ size: CGFloat) -> Font { .custom("Geist-Regular", size: size) }
    static func sansMed(_ size: CGFloat) -> Font { .custom("Geist-Medium", size: size) }
    static func sansSemi(_ size: CGFloat) -> Font { .custom("Geist-SemiBold", size: size) }
}

// Micro-label: names a value ("LIGHT-TIME", "RANGE"). The only uppercase text.
struct MicroLabel: View {
    let text: String
    var color: Color = Theme.dim2
    init(_ text: String, color: Color = Theme.dim2) {
        self.text = text
        self.color = color
    }
    var body: some View {
        Text(text.uppercased())
            .font(.monoMed(11))
            .tracking(11 * 0.08)
            .foregroundStyle(color)
    }
}

extension View {
    /// Title tracking: Geist SemiBold at about -0.022em.
    func titleTracking(_ size: CGFloat) -> some View { tracking(-size * 0.022) }

    /// Floating chrome over the map or photos: glass over a system material,
    /// a 14% hairline and a soft shadow.
    func glass(radius: CGFloat = Theme.rL) -> some View {
        background(
            ZStack {
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(.ultraThinMaterial)
                RoundedRectangle(cornerRadius: radius, style: .continuous).fill(Theme.glass)
            }
        )
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Theme.rule2, lineWidth: 1))
        .shadow(color: .black.opacity(0.5), radius: 20, y: 12)
    }

    /// Glass capsule (pill).
    func glassPill() -> some View {
        background(
            ZStack {
                Capsule().fill(.ultraThinMaterial)
                Capsule().fill(Theme.glass)
            }
        )
        .overlay(Capsule().stroke(Theme.rule2, lineWidth: 1))
        .shadow(color: .black.opacity(0.5), radius: 20, y: 12)
    }

    /// Content card: solid panel, 22pt radius, 8% hairline.
    func card(radius: CGFloat = Theme.rL, fill: Color = Theme.panel) -> some View {
        background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(Theme.rule, lineWidth: 1))
    }
}
