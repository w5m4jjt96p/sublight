import Foundation

// Live, on-demand access to a rover's raw images for a single sol.
// The full archive is enormous, so nothing is bundled; we fetch a sample of a
// sol's frames from the public NASA feeds when the user taps a drive stop.

struct RoverImage: Identifiable {
    let id = UUID()
    let thumb: URL
    let full: URL
    let sourceUrl: URL
    let instrument: String
    let capturedUtc: String
    let sol: Int
}

struct SolImages {
    let sol: Int
    let count: Int
    let images: [RoverImage]
    let moreURL: URL?
}

enum RoverImages {
    private static var cache: [String: SolImages] = [:]

    static func fetch(roverId: String, sol: Int, limit: Int = 48) async -> SolImages {
        let key = "\(roverId):\(sol)"
        if let hit = cache[key] { return hit }
        let result: SolImages
        if roverId == "curiosity" {
            result = (try? await fetchCuriosity(sol: sol, limit: limit)) ?? SolImages(sol: sol, count: 0, images: [], moreURL: nil)
        } else {
            result = (try? await fetchPerseverance(sol: sol, limit: limit)) ?? SolImages(sol: sol, count: 0, images: [], moreURL: nil)
        }
        cache[key] = result
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
            return RoverImage(
                thumb: thumb,
                full: URL(string: fullS) ?? thumb,
                sourceUrl: URL(string: im.link ?? fullS) ?? thumb,
                instrument: im.camera?.instrument ?? "CAMERA",
                capturedUtc: im.date_taken_utc ?? "",
                sol: im.sol ?? sol)
        }
        let more = URL(string: "https://mars.nasa.gov/mars2020/multimedia/raw-images/?order=sol+desc&per_page=100&page=0&begin_sol=\(sol)&end_sol=\(sol)")
        return SolImages(sol: sol, count: d.num_images ?? images.count, images: images, moreURL: more)
    }

    // MARK: - Curiosity (msl raw image items)

    private struct MSLResponse: Decodable {
        struct Item: Decodable {
            let url: String?
            let instrument: String?
            let date_taken: String?
            let sol: Int?
        }
        let items: [Item]
        let total: Int?
    }

    private static func fetchCuriosity(sol: Int, limit: Int) async throws -> SolImages {
        let urlStr = "https://mars.nasa.gov/api/v1/raw_image_items/?order=sol+desc&per_page=\(limit)&page=0"
            + "&condition_1=msl%3Amission&condition_2=\(sol)%3Asol%3Agte&condition_3=\(sol)%3Asol%3Alte"
        let (data, _) = try await URLSession.shared.data(from: URL(string: urlStr)!)
        let d = try JSONDecoder().decode(MSLResponse.self, from: data)
        let images: [RoverImage] = d.items.compactMap { im in
            guard let s = im.url, let u = URL(string: s) else { return nil }
            return RoverImage(thumb: u, full: u, sourceUrl: u,
                              instrument: im.instrument ?? "CAMERA",
                              capturedUtc: im.date_taken ?? "", sol: im.sol ?? sol)
        }
        let more = URL(string: "https://mars.nasa.gov/msl/multimedia/raw-images/?order=sol+desc&per_page=100&page=0&begin_sol=\(sol)&end_sol=\(sol)")
        return SolImages(sol: sol, count: d.total ?? images.count, images: images, moreURL: more)
    }
}
