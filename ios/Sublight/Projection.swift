import Foundation
import CoreGraphics

// Log-radial projection — mirrors src/map/projection.ts exactly.
enum Projection {
    static let rMax: Double = 1000
    static let k: Double = 400
    static let den: Double = log10(1 + 200 * 400)   // log10(1 + 200*K)

    /// Screen-space radius (world units) for a heliocentric distance in AU.
    static func rOf(_ au: Double) -> Double {
        rMax * log10(1 + au * k) / den
    }

    /// World position for (distance AU, ecliptic longitude degrees).
    static func worldPos(au: Double, lonDeg: Double) -> CGPoint {
        let a = (lonDeg - 90) * .pi / 180
        let r = rOf(au)
        return CGPoint(x: cos(a) * r, y: sin(a) * r)
    }

    /// Shortest-arc longitude interpolation between two samples.
    static func interp(auT: Double, auN: Double, lonT: Double, lonN: Double, frac: Double) -> CGPoint {
        let au = auT + (auN - auT) * frac
        var d = (lonN - lonT).truncatingRemainder(dividingBy: 360)
        d = ((d + 540).truncatingRemainder(dividingBy: 360)) - 180
        return worldPos(au: au, lonDeg: lonT + d * frac)
    }
}

// One second of light travels this many AU⁻¹ — OWLT seconds = rangeAu × this.
let LIGHT_SECONDS_PER_AU: Double = 499.004783836
