import Foundation
import Combine

// Live space-weather, mirroring src/data/useSpaceWeather.ts. Seeds from the
// bundled snapshot (spaceweather.json) for an instant first value, then polls
// NOAA SWPC directly every 60s (CORS/ATS-safe: plain HTTPS GET). Failures keep
// the last good value — the UI never shows an error.
@MainActor
final class SpaceWeatherStore: ObservableObject {
    @Published private(set) var current: SpaceWeather?

    private var timer: Timer?
    private let base = "https://services.swpc.noaa.gov"

    init() {
        current = Self.loadBundledSeed()
        Task { await poll() }
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { await self?.poll() }
        }
    }

    deinit { timer?.invalidate() }

    private static func loadBundledSeed() -> SpaceWeather? {
        guard let url = Bundle.main.url(forResource: "spaceweather", withExtension: "json", subdirectory: "data"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(SpaceWeather.self, from: data)
    }

    // MARK: - Live poll

    private struct KpRow: Decodable { let Kp: Double? }
    private struct ScaleVal: Decodable { let Scale: String? }
    private struct ScaleBlock: Decodable { let R: ScaleVal?; let S: ScaleVal?; let G: ScaleVal? }
    private struct WindRow: Decodable { let proton_speed: Double?; let time_tag: String? }
    private struct MagRow: Decodable { let bt: Double?; let bz_gsm: Double?; let time_tag: String? }

    private func get<T: Decodable>(_ path: String, as: T.Type) async -> T? {
        guard let url = URL(string: "\(base)/\(path)?cachebust=\(Int(Date().timeIntervalSince1970 / 60))") else { return nil }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            return try JSONDecoder().decode(T.self, from: data)
        } catch { return nil }
    }

    private func poll() async {
        async let kp = get("products/noaa-planetary-k-index.json", as: [KpRow].self)
        async let scales = get("products/noaa-scales.json", as: [String: ScaleBlock].self)
        async let wind = get("products/summary/solar-wind-speed.json", as: [WindRow].self)
        async let mag = get("products/summary/solar-wind-mag-field.json", as: [MagRow].self)

        let (kpRows, sc, w, m) = await (kp, scales, wind, mag)

        // If everything failed, keep the previous value.
        if kpRows == nil && sc == nil && w == nil && m == nil { return }

        let cur = sc?["0"]
        let num = { (s: String?) -> Double? in s.flatMap { Double($0) } }
        let windRow = w?.first
        let magRow = m?.first

        current = SpaceWeather(
            generatedAt: ISO8601DateFormatter().string(from: Date()),
            kp: kpRows?.last?.Kp,
            gScale: num(cur?.G?.Scale),
            rScale: num(cur?.R?.Scale),
            sScale: num(cur?.S?.Scale),
            windSpeed: windRow?.proton_speed,
            bz: magRow?.bz_gsm,
            bt: magRow?.bt,
            sampledAt: windRow?.time_tag ?? magRow?.time_tag
        )
    }

    // MARK: - Derived label

    static func stormLabel(_ w: SpaceWeather) -> (text: String, level: Int) {
        let g = Int(w.gScale ?? 0)
        if g >= 4 { return ("Severe geomagnetic storm", g) }
        if g >= 3 { return ("Strong geomagnetic storm", g) }
        if g >= 1 { return ("Geomagnetic storm", g) }
        if (w.kp ?? 0) >= 4 { return ("Unsettled field", g) }
        return ("Quiet field", g)
    }
}
