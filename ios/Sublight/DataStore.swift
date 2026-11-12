import Foundation
import Combine

/// A craft plotted on the map: editorial registry + daily ephemeris, joined.
struct Craft: Identifiable {
    let reg: RegistryEntry
    let eph: CraftEphemeris
    var id: String { reg.id }
    var name: String { reg.name }
    var isImaging: Bool { reg.imagery != nil || reg.archiveImage != nil }
}

/// Loads every bundled JSON snapshot and exposes the joined model.
///
/// Positions and light-times must not be as old as the build. An app archived in
/// August kept showing August's solar system, and every "Its light took..." line
/// drifted further from the truth. So the ephemerides are read at launch from the
/// site's static files, the same ones the web reads, and kept on disk for the next
/// launch. The bundle is only the offline floor. No backend: these are plain files.
final class DataStore: ObservableObject {
    @Published private(set) var craft: [Craft] = []
    @Published private(set) var planets: [PlanetEphemeris] = []
    private(set) var registryById: [String: RegistryEntry] = [:]
    private(set) var planetsById: [String: PlanetEphemeris] = [:]
    private(set) var frames: [String: FrameData] = [:]
    private(set) var archive: [String: ArchiveEntry] = [:]
    private(set) var bodies: [String: BodyInfo] = [:]
    private(set) var bodyPhotos: [String: BodyPhoto] = [:]
    private(set) var tracks: [String: RoverTrack] = [:]
    private(set) var satellites: [SatelliteRecord] = []
    private(set) var deepSky: [DeepSkyObject] = []
    private(set) var fleetGeneratedAt: String = ""
    private var registry: [RegistryEntry] = []
    private var planetsGeneratedAt: String = ""

    private static let site = "https://sublight.observer/data/"

    init() {
        load()
        // Last launch's files, so this launch starts from them and not the bundle.
        if let d = Self.readCache("fleet"), let fleet = try? JSONDecoder().decode(FleetData.self, from: d) { apply(fleet) }
        if let d = Self.readCache("planets"), let p = try? JSONDecoder().decode(PlanetsData.self, from: d) { apply(p) }
    }

    /// Newer files from the site, if there are any. Failing is fine: whatever is
    /// already loaded stays, and the next launch tries again.
    @MainActor
    func refreshEphemeris() async {
        async let fleetData = Self.download("fleet")
        async let planetsData = Self.download("planets")
        if let d = await fleetData, let fleet = try? JSONDecoder().decode(FleetData.self, from: d),
           fleet.generatedAt > fleetGeneratedAt, !fleet.craft.isEmpty {
            apply(fleet)
            Self.writeCache("fleet", d)
        }
        if let d = await planetsData, let p = try? JSONDecoder().decode(PlanetsData.self, from: d),
           p.generatedAt > planetsGeneratedAt, !p.planets.isEmpty {
            apply(p)
            Self.writeCache("planets", d)
        }
    }

    private func apply(_ fleet: FleetData) {
        guard fleet.generatedAt > fleetGeneratedAt else { return }
        fleetGeneratedAt = fleet.generatedAt
        let ephById = Dictionary(fleet.craft.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        craft = registry.compactMap { r in ephById[r.id].map { Craft(reg: r, eph: $0) } }
    }

    private func apply(_ data: PlanetsData) {
        guard data.generatedAt > planetsGeneratedAt else { return }
        planetsGeneratedAt = data.generatedAt
        planets = data.planets
        planetsById = Dictionary(data.planets.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    }

    private static func download(_ name: String) async -> Data? {
        guard let url = URL(string: site + name + ".json") else { return nil }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadRevalidatingCacheData
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return data
    }

    private static func cacheURL(_ name: String) -> URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
            .first?.appendingPathComponent("live-\(name).json")
    }
    private static func readCache(_ name: String) -> Data? {
        cacheURL(name).flatMap { try? Data(contentsOf: $0) }
    }
    private static func writeCache(_ name: String, _ data: Data) {
        if let url = cacheURL(name) { try? data.write(to: url, options: .atomic) }
    }

    private func load() {
        registry = decode("registry") ?? []
        let fleet: FleetData? = decode("fleet")
        let planetsData: PlanetsData? = decode("planets")
        frames = decode("frames") ?? [:]
        archive = decode("archive") ?? [:]
        bodies = decode("bodies") ?? [:]
        bodyPhotos = decode("bodyphotos") ?? [:]
        tracks = (decode("tracks") as TracksData?)?.rovers ?? [:]
        satellites = (decode("satellites") as SatellitesData?)?.satellites ?? []
        deepSky = (decode("deepsky") as DeepSkyData?)?.objects ?? []

        registryById = Dictionary(uniqueKeysWithValues: registry.map { ($0.id, $0) })
        fleetGeneratedAt = fleet?.generatedAt ?? ""

        let ephById = Dictionary(uniqueKeysWithValues: (fleet?.craft ?? []).map { ($0.id, $0) })
        craft = registry.compactMap { r in
            guard let e = ephById[r.id] else { return nil }
            return Craft(reg: r, eph: e)
        }

        planetsGeneratedAt = planetsData?.generatedAt ?? ""
        planets = planetsData?.planets ?? []
        planetsById = Dictionary(uniqueKeysWithValues: planets.map { ($0.id, $0) })
    }

    private func decode<T: Decodable>(_ name: String) -> T? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "data") else {
            print("[DataStore] missing resource: data/\(name).json")
            return nil
        }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            print("[DataStore] decode \(name) failed: \(error)")
            return nil
        }
    }

    // MARK: - Image resolution

    /// Resolve a web-style path ("/frames/x.jpg", "/bodies/mars.jpg", "sun.jpg")
    /// to a bundled file URL.
    static func imageURL(_ webPath: String?) -> URL? {
        guard let webPath, !webPath.isEmpty else { return nil }
        let clean = webPath.hasPrefix("/") ? String(webPath.dropFirst()) : webPath
        let comps = clean.split(separator: "/").map(String.init)
        let name = comps.last ?? clean
        let sub = comps.count > 1 ? comps[comps.count - 2] : "bodies"
        let base = (name as NSString).deletingPathExtension
        let ext = (name as NSString).pathExtension
        return Bundle.main.url(forResource: base, withExtension: ext, subdirectory: sub)
    }

    /// A dedicated profile picture of the spacecraft itself (not its imagery),
    /// bundled as avatar-<id>.jpg. Nil falls back to a monogram in the gallery.
    func avatarURL(for id: String) -> URL? {
        Bundle.main.url(forResource: "avatar-\(id)", withExtension: "jpg", subdirectory: "bodies")
    }

    /// Best on-map / hero thumbnail URL for an imaging craft.
    func heroThumb(for id: String) -> URL? {
        if let f = frames[id] { return DataStore.imageURL(f.file) }
        if let a = archive[id] { return DataStore.imageURL(a.file) }
        return nil
    }

    func heroFull(for id: String) -> URL? {
        if let f = frames[id] { return DataStore.imageURL(f.full) }
        if let a = archive[id] { return DataStore.imageURL(a.full) }
        return nil
    }

    /// Current interpolated world position for a selection (for search jump-to).
    func currentWorld(for sel: Selection) -> CGPoint? {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let now = Date()
        let frac = now.timeIntervalSince(cal.startOfDay(for: now)) / 86400
        switch sel {
        case .body("sun"):
            return .zero
        case .body(let id):
            guard let p = planetsById[id] else { return nil }
            return Projection.interp(auT: p.heliocentricAu, auN: p.heliocentricAuNextDay,
                                     lonT: p.eclipticLonDeg, lonN: p.eclipticLonDegNextDay, frac: frac)
        case .craft(let id):
            guard let c = craft.first(where: { $0.id == id }) else { return nil }
            return Projection.interp(auT: c.eph.heliocentricAu, auN: c.eph.heliocentricAuNextDay,
                                     lonT: c.eph.eclipticLonDeg, lonN: c.eph.eclipticLonDegNextDay, frac: frac)
        }
    }

    /// Photo URL for a celestial body, following its editorial photo ref.
    func bodyPhotoURL(_ bodyId: String, full: Bool = false) -> URL? {
        guard let info = bodies[bodyId] else { return nil }
        switch info.photo.kind {
        case "sun":
            return DataStore.imageURL("sun.jpg")
        case "epic":
            if let f = frames["dscovr"] { return DataStore.imageURL(full ? f.full : f.file) }
            return nil
        default:
            if let p = bodyPhotos[bodyId] { return DataStore.imageURL(full ? p.full : p.file) }
            return nil
        }
    }
}
