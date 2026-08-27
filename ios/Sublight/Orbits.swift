import Foundation

// Swift port of src/data/orbits.ts — a self-contained Keplerian + J2 propagator
// for the Near-Earth view. Displayed numbers (altitude, speed, period, light-
// time) derive from mean motion and are honest; only the on-screen angle is
// approximate (no SGP4 short-period / drag terms). Kept in lockstep with the
// web version, which is unit-tested against the ISS.

enum Orbits {
    static let mu: Double = 398_600.4418      // Earth GM, km^3/s^2
    static let rEarth: Double = 6378.137      // equatorial radius, km
    static let j2: Double = 1.08262668e-3
    static let cKmS: Double = 299_792.458     // speed of light, km/s
    private static let deg = Double.pi / 180
    private static let twoPi = Double.pi * 2
    private static let dayS: Double = 86_400

    struct State {
        var x: Double
        var y: Double
        var z: Double
        var r: Double            // geocentric distance, km
        var altitude: Double     // km above the mean surface
        var speed: Double        // km/s
        var periodMin: Double
        var lightSeconds: Double // altitude / c
    }

    static func semiMajorAxis(_ meanMotionRevPerDay: Double) -> Double {
        let n = (meanMotionRevPerDay * twoPi) / dayS   // rad/s
        return cbrt(mu / (n * n))
    }

    static func band(meanMotion: Double, eccentricity e: Double) -> String {
        let a = semiMajorAxis(meanMotion)
        let perigee = a * (1 - e) - rEarth
        let apogee = a * (1 + e) - rEarth
        if apogee - perigee > 20_000 { return "HEO" }
        let alt = a - rEarth
        if alt < 2000 { return "LEO" }
        if alt < 30_000 { return "MEO" }
        return "GEO"
    }

    static func perigeeAltitude(_ sat: SatelliteRecord) -> Double {
        let a = semiMajorAxis(sat.meanMotion)
        return a * (1 - sat.eccentricity) - rEarth
    }

    private static func eccentricAnomaly(_ M: Double, _ e: Double) -> Double {
        var E = e < 0.8 ? M : Double.pi
        for _ in 0..<8 {
            let dE = (E - e * sin(E) - M) / (1 - e * cos(E))
            E -= dE
            if abs(dE) < 1e-10 { break }
        }
        return E
    }

    /// Propagate one satellite's mean elements to `atMs` (ms since Unix epoch).
    static func propagate(_ sat: SatelliteRecord, atMs: Double) -> State {
        let n0 = (sat.meanMotion * twoPi) / dayS       // rad/s
        let a = cbrt(mu / (n0 * n0))                    // km
        let e = sat.eccentricity
        let i = sat.inclination * deg
        let dt = (atMs - sat.epochMs) / 1000            // seconds since epoch

        let p = a * (1 - e * e)
        let cosi = cos(i)
        let sini2 = sin(i) * sin(i)
        let factor = 1.5 * j2 * (rEarth / p) * (rEarth / p) * n0
        let raanDot = -factor * cosi
        let argpDot = factor * (2 - 2.5 * sini2)
        let mDot = n0 + factor * (1 - e * e).squareRoot() * (1 - 1.5 * sini2)

        let raan = sat.raan * deg + raanDot * dt
        let argp = sat.argPerigee * deg + argpDot * dt
        var M = sat.meanAnomaly * deg + mDot * dt
        M = M.truncatingRemainder(dividingBy: twoPi)
        if M < 0 { M += twoPi }

        let E = eccentricAnomaly(M, e)
        let cosE = cos(E), sinE = sin(E)
        let r = a * (1 - e * cosE)

        let xp = a * (cosE - e)
        let yp = a * (1 - e * e).squareRoot() * sinE

        let cosO = cos(raan), sinO = sin(raan)
        let cosw = cos(argp), sinw = sin(argp)
        let cosI = cos(i), sinI = sin(i)

        let x = (cosO * cosw - sinO * sinw * cosI) * xp + (-cosO * sinw - sinO * cosw * cosI) * yp
        let y = (sinO * cosw + cosO * sinw * cosI) * xp + (-sinO * sinw + cosO * cosw * cosI) * yp
        let z = (sinw * sinI) * xp + (cosw * sinI) * yp

        let altitude = r - rEarth
        let speed = (mu * (2 / r - 1 / a)).squareRoot()
        let periodMin = (twoPi / n0) / 60
        let lightSeconds = max(0, altitude) / cKmS

        return State(x: x, y: y, z: z, r: r, altitude: altitude,
                     speed: speed, periodMin: periodMin, lightSeconds: lightSeconds)
    }
}
