import SwiftUI

// The drawn icon set, shared with the web.
//
// SwiftUI cannot render SVG, and converting to an asset-catalogue symbol set
// needs Apple's template. The path data is short and uses only M, L, H, V, C
// and Z, so it is parsed here instead: the same `d` strings the web inlines,
// no second source to keep in step. Generated from design/icons/*.svg.
//
// Strokes inherit the foreground colour, the way an SF Symbol does, so a tab
// can be dim, signal cyan or amber without a second asset.

struct SublightIcon {
    struct Stroke {
        let d: String
        let width: CGFloat
        init(_ d: String, _ width: CGFloat) { self.d = d; self.width = width }
    }
    let strokes: [Stroke]
}

extension SublightIcon {
    static let gallery = SublightIcon(strokes: [
        Stroke("M20.3068 15.3312C16.7859 18.8521 11.1336 18.908 7.61276 15.3872C4.09192 11.8663 4.14799 6.21408 7.66883 2.69323M10.9516 12.0485C14.4414 15.5384 18.6299 17.0081 20.3068 15.3312C21.9837 13.6543 20.5139 9.46584 17.0241 5.97596C13.5342 2.48608 9.34571 1.01635 7.66883 2.69323M7.66883 2.69323C5.99196 4.37011 7.46169 8.55859 10.9516 12.0485M10.9516 12.0485L14 9", 1.5),
        Stroke("M6.48804 15L4.75106 17.4884C3.3523 19.4923 2.65291 20.4942 3.17039 21.2471C3.68787 22 5.07589 22 7.85193 22H12.1481C14.9241 22 16.3121 22 16.8296 21.2471C17.301 20.5612 16.7625 19.6686 15.6053 18", 1.5),
    ])

    static let mars = SublightIcon(strokes: [
        Stroke("M12 12C7.46544 12 3.62948 14.9642 2.35747 19.044C1.99646 20.2019 1.81595 20.7809 2.26968 21.3904C2.7234 22 3.46112 22 4.93655 22H19.0634C20.5389 22 21.2766 22 21.7303 21.3904C22.184 20.7809 22.0035 20.2019 21.6425 19.044C20.3705 14.9642 16.5346 12 12 12Z", 1.5),
        Stroke("M14.9998 17H15.0088", 2),
        Stroke("M12 22C12 20.3431 10.6569 19 9 19C7.34315 19 6 20.3431 6 22", 1.5),
        Stroke("M12 12V7.5M12 7.5V5C12 3.58579 12 2.87868 12.4393 2.43934C12.8787 2 13.5858 2 15 2H17.25C18.4228 2 19.0092 2 19.4131 2.30997C19.5171 2.38977 19.6102 2.48286 19.69 2.58686C20 2.99082 20 3.57721 20 4.75C20 5.92279 20 6.50918 19.69 6.91314C19.6102 7.01714 19.5171 7.11023 19.4131 7.19003C19.0092 7.5 18.4228 7.5 17.25 7.5H12Z", 1.5),
    ])

    static let sun = SublightIcon(strokes: [
        Stroke("M9.89 8.03C14.37 5.64 18.96 5.49 20.12 7.68C21.29 9.88 18.60 13.59 14.11 15.97C9.63 18.36 5.04 18.51 3.88 16.32C2.71 14.12 5.40 10.41 9.89 8.03Z", 1.5),
        Stroke("M12.00 8.90C13.71 8.90 15.10 10.29 15.10 12.00C15.10 13.71 13.71 15.10 12.00 15.10C10.29 15.10 8.90 13.71 8.90 12.00C8.90 10.29 10.29 8.90 12.00 8.90Z", 1.5),
        Stroke("M15.60 5.18C16.16 5.18 16.60 5.63 16.60 6.18C16.60 6.73 16.16 7.18 15.60 7.18C15.05 7.18 14.60 6.73 14.60 6.18C14.60 5.63 15.05 5.18 15.60 5.18Z", 1.5),
    ])

    static let deepSky = SublightIcon(strokes: [
        Stroke("M20.5 5C21.3284 5 22 4.32843 22 3.5C22 2.67157 21.3284 2 20.5 2C19.6716 2 19 2.67157 19 3.5C19 4.32843 19.6716 5 20.5 5Z", 1.5),
        Stroke("M3.5 22C4.32843 22 5 21.3284 5 20.5C5 19.6716 4.32843 19 3.5 19C2.67157 19 2 19.6716 2 20.5C2 21.3284 2.67157 22 3.5 22Z", 1.5),
        Stroke("M21.0385 13.0623C21.6076 12.9268 22 12.4933 22 12C22 11.5067 21.6076 11.0732 21.0385 10.9377L16.5212 9.8622C15.7198 8.17022 13.9966 7 12 7C10.0034 7 8.28021 8.17023 7.47877 9.8622L2.96152 10.9377C2.39239 11.0732 2 11.5067 2 12C2 12.4933 2.39239 12.9268 2.96152 13.0623L7.47877 14.1378C8.28021 15.8298 10.0034 17 12 17C13.9966 17 15.7198 15.8298 16.5212 14.1378L21.0385 13.0623Z", 1.5),
        Stroke("M12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z", 1.5),
        Stroke("M15 2.4578C14.053 2.16035 13.0452 2 12 2C8.72836 2 5.82368 3.57111 3.99927 6M9 21.5422C9.94704 21.8396 10.9548 22 12 22C15.2712 22 18.1755 20.4293 20 18.001", 1.5),
    ])

    static let tracking = SublightIcon(strokes: [
        Stroke("M16.201 7.79899C17.8024 9.40034 20.3987 9.40034 22 7.79899L16.201 2C14.5997 3.60135 14.5997 6.19764 16.201 7.79899Z", 1.5),
        Stroke("M16 8L14.5 9.5", 1.5),
        Stroke("M14.8322 13C15.4344 12.3978 15.7354 12.0967 15.7354 11.7226C15.7354 11.3485 15.4344 11.0474 14.8322 10.4452L13.5548 9.16781C12.9526 8.56564 12.6515 8.26456 12.2774 8.26456C11.9033 8.26456 11.6022 8.56564 11 9.16781L6.79367 13.3742C5.73544 14.4324 5.73544 16.1481 6.79367 17.2064C7.8519 18.2646 9.56763 18.2646 10.6259 17.2064L14.8322 13Z", 1.5),
        Stroke("M15.4688 16.8563L16.8563 15.4688C17.5104 14.8147 17.8374 14.4877 18.2438 14.4877C18.6502 14.4877 18.9773 14.8147 19.6314 15.4688L21.0189 16.8563C21.673 17.5104 22 17.8374 22 18.2438C22 18.6502 21.673 18.9773 21.0189 19.6314L19.6314 21.0189C18.9773 21.673 18.6502 22 18.2438 22C17.8374 22 17.5104 21.673 16.8563 21.0189L15.4688 19.6314C14.8147 18.9773 14.4877 18.6502 14.4877 18.2438C14.4877 17.8374 14.8147 17.5104 15.4688 16.8563Z", 1.5),
        Stroke("M2.98112 4.36864L4.36864 2.98112C5.02273 2.32704 5.34977 2 5.75616 2C6.16256 2 6.4896 2.32704 7.14368 2.98112L8.5312 4.36864C9.18528 5.02273 9.51233 5.34977 9.51233 5.75616C9.51233 6.16256 9.18528 6.4896 8.5312 7.14368L7.14368 8.5312C6.4896 9.18528 6.16256 9.51233 5.75616 9.51233C5.34977 9.51233 5.02273 9.18528 4.36864 8.5312L2.98112 7.14368C2.32704 6.4896 2 6.16256 2 5.75616C2 5.34977 2.32704 5.02273 2.98112 4.36864Z", 1.5),
        Stroke("M16 16L14 14M9.99999 10L8 8", 1.5),
    ])
}

/// Parses one SVG path in the 24x24 viewBox and scales it to the frame.
private struct SVGPath: Shape {
    let d: String

    func path(in rect: CGRect) -> Path {
        var p = Path()
        var current = CGPoint.zero
        var start = CGPoint.zero
        var cmd: Character = "M"
        var nums: [CGFloat] = []
        var i = d.startIndex

        func flush() {
            guard !nums.isEmpty || cmd == "Z" || cmd == "z" else { return }
            var k = 0
            switch cmd {
            case "M", "m":
                while k + 1 < nums.count || (k + 2 <= nums.count) {
                    guard k + 2 <= nums.count else { break }
                    var pt = CGPoint(x: nums[k], y: nums[k + 1])
                    if cmd == "m" { pt = CGPoint(x: current.x + pt.x, y: current.y + pt.y) }
                    // Extra pairs after a moveto are implicit linetos.
                    if k == 0 { p.move(to: pt); start = pt } else { p.addLine(to: pt) }
                    current = pt
                    k += 2
                }
            case "L", "l":
                while k + 2 <= nums.count {
                    var pt = CGPoint(x: nums[k], y: nums[k + 1])
                    if cmd == "l" { pt = CGPoint(x: current.x + pt.x, y: current.y + pt.y) }
                    p.addLine(to: pt); current = pt; k += 2
                }
            case "H", "h":
                for v in nums {
                    let x = cmd == "h" ? current.x + v : v
                    let pt = CGPoint(x: x, y: current.y)
                    p.addLine(to: pt); current = pt
                }
            case "V", "v":
                for v in nums {
                    let y = cmd == "v" ? current.y + v : v
                    let pt = CGPoint(x: current.x, y: y)
                    p.addLine(to: pt); current = pt
                }
            case "C", "c":
                while k + 6 <= nums.count {
                    var c1 = CGPoint(x: nums[k], y: nums[k + 1])
                    var c2 = CGPoint(x: nums[k + 2], y: nums[k + 3])
                    var to = CGPoint(x: nums[k + 4], y: nums[k + 5])
                    if cmd == "c" {
                        c1 = CGPoint(x: current.x + c1.x, y: current.y + c1.y)
                        c2 = CGPoint(x: current.x + c2.x, y: current.y + c2.y)
                        to = CGPoint(x: current.x + to.x, y: current.y + to.y)
                    }
                    p.addCurve(to: to, control1: c1, control2: c2)
                    current = to; k += 6
                }
            case "Z", "z":
                p.closeSubpath(); current = start
            default:
                break
            }
            nums.removeAll(keepingCapacity: true)
        }

        while i < d.endIndex {
            let ch = d[i]
            if ch.isLetter {
                flush()
                cmd = ch
                i = d.index(after: i)
            } else if ch == "-" || ch == "." || ch.isNumber {
                var j = i
                var seenDot = false
                if d[j] == "-" { j = d.index(after: j) }
                while j < d.endIndex, d[j].isNumber || (d[j] == "." && !seenDot) {
                    if d[j] == "." { seenDot = true }
                    j = d.index(after: j)
                }
                nums.append(CGFloat(Double(d[i..<j]) ?? 0))
                i = j
            } else {
                i = d.index(after: i)
            }
        }
        flush()

        let s = min(rect.width, rect.height) / 24
        return p.applying(CGAffineTransform(scaleX: s, y: s))
    }
}

/// Draws a `SublightIcon` at the given side length, in the foreground colour.
struct IconView: View {
    let icon: SublightIcon
    let size: CGFloat

    var body: some View {
        ZStack {
            ForEach(Array(icon.strokes.enumerated()), id: \.offset) { _, s in
                SVGPath(d: s.d)
                    .stroke(style: StrokeStyle(lineWidth: s.width * size / 24,
                                               lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: size, height: size)
    }
}
