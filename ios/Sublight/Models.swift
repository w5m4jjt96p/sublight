import Foundation

// MARK: - Registry (editorial, time-invariant — data/registry.json)

struct RegistryEntry: Codable, Identifiable {
    struct Imagery: Codable { let source: String }          // mars2020 | msl | epic
    struct ArchiveRef: Codable { let nasaId: String; let title: String; let credit: String }

    let id: String
    let name: String
    let naifId: Int?
    let agency: String
    let launched: String
    let arrived: String?
    let status: String        // active | cruise | dormant | silent | retired
    let kind: String          // rover | orbiter | flyby | observatory | lander
    let host: String?         // planet/body id or null
    let location: String
    let imagery: Imagery?
    let archiveImage: ArchiveRef?
    let note: String
}

// MARK: - Ephemerides (generated daily — public/data/fleet.json + planets.json)

struct CraftEphemeris: Codable {
    let id: String
    let heliocentricAu: Double
    let eclipticLonDeg: Double
    let heliocentricAuNextDay: Double
    let eclipticLonDegNextDay: Double
    let rangeAu: Double
    let rangeAuNextDay: Double
    let owltSeconds: Double
    let source: String
    let stale: Bool?
}

struct FleetData: Codable {
    let generatedAt: String
    let craft: [CraftEphemeris]
}

struct PlanetEphemeris: Codable {
    let id: String
    let name: String
    let heliocentricAu: Double
    let eclipticLonDeg: Double
    let heliocentricAuNextDay: Double
    let eclipticLonDegNextDay: Double
}

struct PlanetsData: Codable {
    let generatedAt: String
    let planets: [PlanetEphemeris]
}

// MARK: - Imagery (public/data/frames.json — keyed by craft id)

struct FrameThumb: Codable {
    let file: String
    let full: String
    let sourceUrl: String
    let instrument: String
    let capturedUtc: String
    let sol: Int?
}

struct FrameData: Codable {
    let sol: Int?
    let instrument: String
    let capturedUtc: String
    let file: String
    let full: String
    let sourceUrl: String
    let credit: String
    let recent: [FrameThumb]?
}

// MARK: - Archive stills (public/data/archive.json — keyed by craft id)

struct ArchiveEntry: Codable {
    let file: String
    let full: String
    let sourceUrl: String
    let title: String
    let credit: String
}

// MARK: - Body editorial (ios/Resources/data/bodies.json — keyed by body id)

struct BodyFact: Codable, Identifiable {
    let label: String
    let value: String
    var id: String { label }
}

struct BodyPhotoRef: Codable {
    let kind: String          // sun | epic | nasa
    let id: String?
    let title: String?
    let credit: String?
}

struct BodyInfo: Codable {
    let name: String
    let kind: String
    let blurb: String
    let facts: [BodyFact]
    let photo: BodyPhotoRef
}

// MARK: - Body photos (public/data/bodyphotos.json — keyed by body id)

struct BodyPhoto: Codable {
    let file: String
    let full: String
    let sourceUrl: String
}

// MARK: - Mars rover surface traverses (data/tracks.json)

struct TrackWaypoint: Codable {
    let lon: Double
    let lat: Double
    let sol: Int?
}

struct TrackFrame: Codable {
    let wxWest: Double
    let wxEast: Double
    let wyNorth: Double
    let wySouth: Double
}

struct RoverTrack: Codable, Identifiable {
    struct Current: Codable {
        let lon: Double
        let lat: Double
        let sol: Int?
        let site: Int?
        let drive: Int?
    }
    let id: String
    let label: String
    let basemap: String
    let image: String
    let w: Int
    let h: Int
    let frame: TrackFrame
    let metersPerPixel: Double
    let distanceKm: Double?
    let solFirst: Int?
    let solLast: Int?
    let current: Current
    let waypoints: [TrackWaypoint]
}

struct TracksData: Codable {
    let generatedAt: String
    let rovers: [String: RoverTrack]
}

// MARK: - Near-Earth satellites (public/data/satellites.json)

struct SatelliteRecord: Codable, Identifiable {
    let norad: Int
    let name: String
    let group: String
    let band: String          // LEO | MEO | GEO | HEO
    let note: String?
    let epochMs: Double        // TLE epoch, ms since Unix epoch
    let meanMotion: Double     // rev/day
    let eccentricity: Double
    let inclination: Double    // deg
    let raan: Double
    let argPerigee: Double
    let meanAnomaly: Double
    let meanMotionDot: Double
    var id: Int { norad }
    var isHero: Bool { group == "hero" }
}

struct SatellitesData: Codable {
    let generatedAt: String
    let satellites: [SatelliteRecord]
}

// MARK: - Deep sky (public/data/deepsky.json — images served from the site)

struct DeepSkyObject: Codable, Identifiable {
    let id: String
    let name: String
    let kind: String
    let catalog: String
    let distanceLy: Double
    let file: String
    let full: String
    let sourceUrl: String
    let credit: String
    let note: String
}

struct DeepSkyData: Codable {
    let generatedAt: String
    let objects: [DeepSkyObject]
}

// MARK: - Space weather (public/data/spaceweather.json + live NOAA SWPC poll)

struct SpaceWeather: Codable {
    let generatedAt: String
    let kp: Double?
    let gScale: Double?
    let rScale: Double?
    let sScale: Double?
    let windSpeed: Double?
    let bz: Double?
    let bt: Double?
    let sampledAt: String?
}
