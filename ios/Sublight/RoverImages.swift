import Foundation

// Live, on-demand access to a rover's raw images for a single sol.
// The full archive is enormous, so nothing is bundled; we fetch a sample of a
// sol's frames from the public NASA feeds when the user taps a drive stop.

// mars.nasa.gov serves size variants of every MSL frame by suffix, and the
// saving is dramatic: a NAVCAM frame is 536 KB raw, 113 KB as -br, 8 KB as
// -thm. Feeding the raw frame into a 34pt filmstrip cell was what made images
// feel slow to arrive. Verified present on every MSL camera.
func mslVariant(_ url: URL, _ suffix: String) -> URL {
    let s = url.absoluteString
    guard let dot = s.range(of: ".", options: .backwards), dot.lowerBound > s.startIndex else { return url }
    let ext = String(s[dot.lowerBound...])
    guard ext.lowercased() == ".jpg" else { return url }
    return URL(string: String(s[s.startIndex..<dot.lowerBound]) + suffix + ext) ?? url
}

struct RoverImage: Identifiable, Sendable {
    let id = UUID()
    /// Smallest size: the scrub strip.
    let thumb: URL
    /// Mid size for the feed stage.
    let view: URL
    let full: URL
    let sourceUrl: URL
    let instrument: String
    let capturedUtc: String
    /// When the frame actually reached Earth: the feed's `date_received`. This
    /// is what the gallery orders and dates by. Capture time plus light-time is
    /// not an arrival — a rover buffers frames and downlinks them through a
    /// relay orbiter hours or days after the shutter.
    let receivedUtc: String
    let sol: Int
}

/// Rovers shoot in stereo: the same instant through a left and a right eye, and
/// both eyes are published as separate frames. A sol of 214 Perseverance frames
/// is really about 149 scenes. Keep the left eye when a right one shares its
/// capture time and its camera differs only by which eye it is.
///
/// Measured live: Perseverance sol 1972 goes 214 to 149, Curiosity sol 5008
/// goes 199 to 111.
func dropStereoTwins(_ frames: [RoverImage]) -> [RoverImage] {
    var seen: [String: Int] = [:]
    var out: [RoverImage] = []
    for f in frames {
        let base = f.instrument
            .replacingOccurrences(of: "_LEFT", with: "")
            .replacingOccurrences(of: "_RIGHT", with: "")
        let key = "\(f.capturedUtc)|\(base)"
        guard let at = seen[key] else {
            seen[key] = out.count
            out.append(f)
            continue
        }
        if f.instrument.contains("LEFT") && out[at].instrument.contains("RIGHT") { out[at] = f }
    }
    return out
}

/// How much a camera is worth opening a post on, lowest number first. The raw
/// feeds carry no "featured" or "interesting" flag; the closest thing NASA
/// publishes is MSL's `instrument_sort` (Mastcam 1, ChemCam RMI 4, Navcam 7-8),
/// and this matches it while also covering Perseverance, which has no
/// equivalent field.
func cameraRank(_ instrument: String) -> Int {
    if instrument.contains("MCZ") || instrument.contains("MAST") || instrument.contains("ZCAM") { return 0 }
    if instrument.contains("NAVCAM") || instrument.contains("NAV_") { return 1 }
    if instrument.contains("RMI") || instrument.contains("SUPERCAM") || instrument.contains("CHEMCAM") { return 2 }
    if instrument.contains("HAZ") { return 3 }
    return 4
}

struct SolImages: Sendable {
    let sol: Int
    let count: Int
    let images: [RoverImage]
    let moreURL: URL?
}

/// The caches are touched by several tasks at once: the feed's own refresh, a
/// pull to refresh, a return to the foreground, and the background check behind
/// notifications. A Swift Dictionary is not safe under concurrent writes, and
/// this crashed the app on launch with a segfault inside
/// `Dictionary._Variant.setValue`. An actor serialises every access.
private actor ImageCache {
    private var sols: [String: SolImages] = [:]
    private var latest: [String: (at: Date, images: [RoverImage])] = [:]

    func sol(_ key: String) -> SolImages? { sols[key] }
    func store(_ key: String, _ value: SolImages) { sols[key] = value }

    func latestFresh(_ key: String, ttl: TimeInterval) -> [RoverImage]? {
        guard let hit = latest[key], Date().timeIntervalSince(hit.at) < ttl else { return nil }
        return hit.images
    }
    func storeLatest(_ key: String, _ images: [RoverImage]) { latest[key] = (Date(), images) }
}

enum RoverImages {
    private static let store = ImageCache()

    // ---- newest published frames --------------------------------------------
    // The bundled snapshot is only as fresh as the last data refresh, and NASA
    // publishes in bursts through the day, so the feed asks for the most
    // recently *published* frames (ordered by date_received) rather than
    // guessing a sol.
    private static let latestTTL: TimeInterval = 300

    /// `force` skips the cache on the way in (never on the way out). Re-opening
    /// the gallery, pulling to refresh and the background check all take this
    /// path: the sol on screen is still being added to, so a cached answer is
    /// the wrong answer.
    static func fetchLatest(roverId: String, limit: Int = 48, force: Bool = false) async -> [RoverImage] {
        let key = "\(roverId):\(limit)"
        if !force, let hit = await store.latestFresh(key, ttl: latestTTL) { return hit }
        let images: [RoverImage]
        if roverId == "curiosity" {
            images = (try? await latestCuriosity(limit: limit)) ?? []
        } else {
            images = (try? await latestPerseverance(limit: limit)) ?? []
        }
        let deduped = dropStereoTwins(images)
        if !deduped.isEmpty { await store.storeLatest(key, deduped) }
        return deduped
    }

    private static func latestPerseverance(limit: Int) async throws -> [RoverImage] {
        let urlStr = "https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json"
            + "&num=\(limit)&page=0&order=date_received+desc"
        let (data, _) = try await URLSession.shared.data(from: URL(string: urlStr)!)
        let d = try JSONDecoder().decode(M20Response.self, from: data)
        return d.images.compactMap { im in
            let f = im.image_files
            guard let thumbS = f?.small ?? f?.medium ?? f?.large ?? f?.full_res,
                  let thumb = URL(string: thumbS) else { return nil }
            let fullS = f?.large ?? f?.full_res ?? f?.medium ?? thumbS
            let viewS = f?.medium ?? f?.large ?? thumbS
            return RoverImage(thumb: thumb, view: URL(string: viewS) ?? thumb, full: URL(string: fullS) ?? thumb,
                              sourceUrl: URL(string: im.link ?? fullS) ?? thumb,
                              instrument: im.camera?.instrument ?? "CAMERA",
                              capturedUtc: im.date_taken_utc ?? "",
                              receivedUtc: im.date_received ?? "", sol: im.sol ?? 0)
        }
    }

    private static func latestCuriosity(limit: Int) async throws -> [RoverImage] {
        let urlStr = "https://mars.nasa.gov/api/v1/raw_image_items/?order=date_received+desc"
            + "&per_page=\(limit * 2)&page=0&condition_1=msl%3Amission"
        let (data, _) = try await URLSession.shared.data(from: URL(string: urlStr)!)
        let d = try JSONDecoder().decode(MSLResponse.self, from: data)
        return d.items.filter { $0.is_thumbnail != true }.prefix(limit).compactMap { im in
            guard let s = im.url, let u = URL(string: s) else { return nil }
            return RoverImage(thumb: mslVariant(u, "-thm"), view: mslVariant(u, "-br"), full: u, sourceUrl: u,
                              instrument: im.instrument ?? "CAMERA",
                              capturedUtc: im.date_taken ?? "",
                              receivedUtc: im.date_received ?? "", sol: im.sol ?? 0)
        }
    }

    static func fetch(roverId: String, sol: Int, limit: Int = 120, force: Bool = false) async -> SolImages {
        let key = "\(roverId):\(sol):\(limit)"
        if !force, let hit = await store.sol(key) { return hit }
        let result: SolImages
        if roverId == "curiosity" {
            result = (try? await fetchCuriosity(sol: sol, limit: limit)) ?? SolImages(sol: sol, count: 0, images: [], moreURL: nil)
        } else {
            result = (try? await fetchPerseverance(sol: sol, limit: limit)) ?? SolImages(sol: sol, count: 0, images: [], moreURL: nil)
        }
        await store.store(key, result)
        return result
    }

    // MARK: - Perseverance (mars2020 raw images)

    private struct M20Response: Decodable {
        struct Image: Decodable {
            struct Files: Decodable { let small: String?; let medium: String?; let large: String?; let full_res: String? }
            struct Camera: Decodable { let instrument: String? }
            let image_files: Files?
            let camera: Camera?
            let date_taken_utc: String?
            let date_received: String?
            let sol: Int?
            let link: String?
        }
        let images: [Image]
        let num_images: Int?
    }

    private static func fetchPerseverance(sol: Int, limit: Int) async throws -> SolImages {
        let urlStr = "https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json"
            + "&num=\(limit)&page=0&order=sol+desc&sol=\(sol)"
        let (data, _) = try await URLSession.shared.data(from: URL(string: urlStr)!)
        let d = try JSONDecoder().decode(M20Response.self, from: data)
        let images: [RoverImage] = d.images.prefix(limit).compactMap { im in
            let f = im.image_files
            guard let thumbS = f?.small ?? f?.medium ?? f?.large ?? f?.full_res,
                  let thumb = URL(string: thumbS) else { return nil }
            let fullS = f?.large ?? f?.full_res ?? f?.medium ?? thumbS
            let viewS = f?.medium ?? f?.large ?? thumbS
            return RoverImage(
                thumb: thumb,
                view: URL(string: viewS) ?? thumb,
                full: URL(string: fullS) ?? thumb,
                sourceUrl: URL(string: im.link ?? fullS) ?? thumb,
                instrument: im.camera?.instrument ?? "CAMERA",
                capturedUtc: im.date_taken_utc ?? "",
                receivedUtc: im.date_received ?? "",
                sol: im.sol ?? sol)
        }
        let more = URL(string: "https://mars.nasa.gov/mars2020/multimedia/raw-images/?order=sol+desc&per_page=100&page=0&begin_sol=\(sol)&end_sol=\(sol)")
        return SolImages(sol: sol, count: d.num_images ?? images.count, images: dropStereoTwins(images), moreURL: more)
    }

    // MARK: - Curiosity (msl raw image items)

    private struct MSLResponse: Decodable {
        struct Item: Decodable {
            let url: String?
            let instrument: String?
            let date_taken: String?
            let date_received: String?
            let sol: Int?
            let is_thumbnail: Bool?
        }
        let items: [Item]
        let total: Int?
    }

    private static func fetchCuriosity(sol: Int, limit: Int) async throws -> SolImages {
        // Each full frame ships with a low-res `is_thumbnail` twin, so over-fetch
        // and drop the thumbnails before trimming to `limit` full frames.
        let urlStr = "https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=\(limit * 2)&page=0"
            + "&condition_1=msl%3Amission&condition_2=\(sol)%3Asol%3Agte&condition_3=\(sol)%3Asol%3Alte"
        let (data, _) = try await URLSession.shared.data(from: URL(string: urlStr)!)
        let d = try JSONDecoder().decode(MSLResponse.self, from: data)
        let full = d.items.filter { $0.is_thumbnail != true }
        let images: [RoverImage] = full.prefix(limit).compactMap { im in
            guard let s = im.url, let u = URL(string: s) else { return nil }
            return RoverImage(thumb: mslVariant(u, "-thm"), view: mslVariant(u, "-br"), full: u, sourceUrl: u,
                              instrument: im.instrument ?? "CAMERA",
                              capturedUtc: im.date_taken ?? "",
                              receivedUtc: im.date_received ?? "", sol: im.sol ?? sol)
        }
        let more = URL(string: "https://mars.nasa.gov/msl/multimedia/raw-images/?order=sol+desc&per_page=100&page=0&begin_sol=\(sol)&end_sol=\(sol)")
        return SolImages(sol: sol, count: full.count, images: dropStereoTwins(images), moreURL: more)
    }
}
