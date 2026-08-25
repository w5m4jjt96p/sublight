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
