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
    /// What the frame is worth showing, from its metadata. See `frameScore`.
    let score: Int
}

// What a raw frame is worth showing. The feeds carry no "featured" flag, and the
// raw stream is mostly engineering: night noise, flat sky, narrowband repeats of
// one scene, tiny sun-finding crops. Scored from metadata alone, so the frame a
// post opens on is known before any pixel loads. Calibrated by reading the pixels
// of 1,271 frames across eight sols. Port of src/data/frameScore.ts: keep the two
// in step.
func frameScore(instrument: String, name: String, lmst: String?, mastEl: String?, rect: String?) -> Int {
    func has(_ text: String, _ pattern: String) -> Bool {
        text.range(of: pattern, options: .regularExpression) != nil
    }
    let inst = instrument.uppercased()
    let file = name.split(separator: "/").last.map(String.init) ?? name
    let mastCam = has(inst, "MCZ|MAST|ZCAM")
    let scene = mastCam || has(inst, "NAV|RMI|SUPERCAM|CHEMCAM")
    let armCam = has(inst, "WATSON|MAHLI") // carry their own lights

    if !armCam, let lmst, let r = lmst.range(of: "M[0-9]{2}:[0-9]{2}", options: .regularExpression) {
        let parts = lmst[r].dropFirst().split(separator: ":").compactMap { Double($0) }
        if parts.count == 2 {
            let hour = parts[0] + parts[1] / 60
            if hour < 6.5 || hour > 18 { return -1 }                    // night noise
        }
    }
    if scene, let el = mastEl.flatMap(Double.init), el > 15 { return -1 } // sky, Sun

    let numbers = (rect ?? "").split(whereSeparator: { !$0.isNumber }).compactMap { Double($0) }
    let dims: (w: Double, h: Double)? = numbers.count >= 2 ? (numbers[numbers.count - 2], numbers[numbers.count - 1]) : nil
    if let dims, min(dims.w, dims.h) < 200 { return -1 }                 // sun-finding crops

    // Filter 0 is Mastcam-Z's colour; 1 to 7 are grey narrowband repeats of the
    // same scene. E01 is Curiosity's colour product.
    let colour = has(file, "^Z[LR]0_") || file.contains("E01_DXXX")
    var score: Int
    if mastCam { score = colour ? 100 : 10 }     // otherwise a filter repeat or flat grey product
    else if inst.contains("NAV") { score = 55 }
    else if armCam { score = 50 }
    else if has(inst, "RMI|SUPERCAM|CHEMCAM") { score = 38 } // a round vignette: detail, not a view
    else if inst.contains("HAZ") { score = 30 }
    else { score = 15 }

    if let dims {
        if max(dims.w, dims.h) / max(1, min(dims.w, dims.h)) > 2 { score -= 15 } // strips
        if min(dims.w, dims.h) < 300 { score -= 10 }
    }
    return max(0, score)
}

/// Below this: repeats, hidden as soon as a post has better frames to show.
let frameScoreGood = 20

/// Plain name for a camera; the raw ids mean nothing to a reader.
func cameraName(_ instrument: String) -> String {
    let i = instrument.uppercased()
    if i.contains("MCZ") || i.contains("ZCAM") { return "Mastcam-Z" }
    if i.contains("MAST") { return "Mastcam" }
    if i.contains("NAV") { return "Navcam" }
    if i.contains("FHAZ") || i.contains("FRONT_HAZ") { return "Front Hazcam" }
    if i.contains("RHAZ") || i.contains("REAR_HAZ") { return "Rear Hazcam" }
    if i.contains("SUPERCAM") { return "SuperCam" }
    if i.contains("CHEMCAM") { return "ChemCam" }
    if i.contains("WATSON") { return "WATSON" }
    if i.contains("MAHLI") { return "MAHLI" }
    if i.contains("MARDI") { return "MARDI" }
    if i.contains("SKYCAM") { return "SkyCam" }
    return instrument.replacingOccurrences(of: "_", with: " ")
}

/// Tolerates a field the feed sends in an unexpected shape. One odd record must
/// not fail the decode of the whole response and leave the feed empty.
private struct Lossy<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

/// A value the feeds send sometimes as a string, sometimes as a number.
private struct Loose: Decodable {
    let text: String?
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { text = s }
        else if let d = try? c.decode(Double.self) { text = String(d) }
        else { text = nil }
    }
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
    // publishes in bursts through the day, so the feed asks NASA for what is
    // newest. Perseverance is asked by sol, not by date_received: measured
    // uncached, the mars2020 endpoint takes 11 s to sort on date_received and
    // 0.35 s to sort on sol, for the same newest frames.
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
            + "&num=\(limit)&page=0&order=sol+desc"
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
                              receivedUtc: im.date_received ?? "", sol: im.sol ?? 0,
                              score: im.score(name: thumbS))
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
                              receivedUtc: im.date_received ?? "", sol: im.sol ?? 0,
                              score: im.score(name: s))
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
            let date_taken_mars: String?
            let date_received: String?
            let sol: Int?
            let link: String?
            let extended: Lossy<Extended>?

            struct Extended: Decodable { let mastEl: Loose?; let dimension: String? }

            func score(name: String) -> Int {
                frameScore(instrument: camera?.instrument ?? "", name: name, lmst: date_taken_mars,
                           mastEl: extended?.value?.mastEl?.text, rect: extended?.value?.dimension)
            }
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
                sol: im.sol ?? sol,
                score: im.score(name: thumbS))
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
            let subframe_rect: String?
            let extended: Lossy<Extended>?

            struct Extended: Decodable { let lmst: String?; let mast_el: Loose? }

            func score(name: String) -> Int {
                frameScore(instrument: instrument ?? "", name: name, lmst: extended?.value?.lmst,
                           mastEl: extended?.value?.mast_el?.text, rect: subframe_rect)
            }
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
                              receivedUtc: im.date_received ?? "", sol: im.sol ?? sol,
                              score: im.score(name: s))
        }
        let more = URL(string: "https://mars.nasa.gov/msl/multimedia/raw-images/?order=sol+desc&per_page=100&page=0&begin_sol=\(sol)&end_sol=\(sol)")
        return SolImages(sol: sol, count: full.count, images: dropStereoTwins(images), moreURL: more)
    }
}
