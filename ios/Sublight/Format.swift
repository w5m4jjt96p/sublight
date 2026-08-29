import Foundation

enum Fmt {
    /// Light-time from seconds → the headline "X min Y s" / "X h Y min" / "X d" form.
    static func lightTime(_ seconds: Double) -> String {
        guard seconds > 0 else { return "—" }
        let s = Int(seconds.rounded())
        if s < 60 { return "\(s) s" }
        if s < 3600 {
            let m = s / 60, r = s % 60
            return r == 0 ? "\(m) min" : "\(m) min \(r) s"
        }
        if s < 86400 {
            let h = s / 3600, m = (s % 3600) / 60
            return m == 0 ? "\(h) h" : "\(h) h \(m) min"
        }
        let d = s / 86400, h = (s % 86400) / 3600
        return h == 0 ? "\(d) d" : "\(d) d \(h) h"
    }

    /// Compact one-line light-time, e.g. "6h 02m", "22h", "1d 4h".
    static func lightTimeShort(_ seconds: Double) -> String {
        guard seconds > 0 else { return "—" }
        let s = Int(seconds.rounded())
        if s < 60 { return "\(s)s" }
        if s < 3600 {
            let m = s / 60, r = s % 60
            return String(format: "%dm %02ds", m, r)
        }
        if s < 86400 {
            let h = s / 3600, m = (s % 3600) / 60
            return String(format: "%dh %02dm", h, m)
        }
        let d = s / 86400, h = (s % 86400) / 3600
        return "\(d)d \(h)h"
    }

    /// Light-time with a scale-appropriate unit: ms near Earth, then s, then the
    /// compact duration form. Mirrors src/data/format.ts fmtLight.
    static func lightScaled(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "—" }
        if seconds < 1 {
            let ms = seconds * 1000
            return String(format: seconds < 0.1 ? "%.1f ms" : "%.0f ms", ms)
        }
        if seconds < 60 {
            return String(format: "%.2f s", seconds).replacingOccurrences(of: ".00 s", with: " s")
        }
        return lightTime(seconds)
    }

    /// Plain kilometres with thousands separators.
    static func kmValue(_ km: Double) -> String {
        guard km.isFinite else { return "—" }
        if km < 10 { return String(format: "%.1f km", km) }
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return (f.string(from: NSNumber(value: km)) ?? "—") + " km"
    }

    /// A light-year distance as the age of its light: "1,344 years",
    /// "2.5 million years", "13.2 billion years".
    static func lightYears(_ ly: Double) -> String {
        guard ly.isFinite else { return "—" }
        func trim(_ x: Double) -> String {
            let s = String(format: "%.1f", x)
            return s.hasSuffix(".0") ? String(s.dropLast(2)) : s
        }
        if ly >= 1e9 { return "\(trim(ly / 1e9)) billion years" }
        if ly >= 1e6 { return "\(trim(ly / 1e6)) million years" }
        if ly >= 1e5 { return "\(Int((ly / 1e3).rounded())),000 years" }
        let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0
        return (f.string(from: NSNumber(value: ly)) ?? "\(Int(ly))") + " years"
    }

    static func au(_ v: Double) -> String {
        if v >= 100 { return String(format: "%.0f AU", v) }
        if v >= 10 { return String(format: "%.1f AU", v) }
        return String(format: "%.2f AU", v)
    }

    static func km(_ au: Double) -> String {
        let km = au * 149_597_870.7
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return (f.string(from: NSNumber(value: km)) ?? "—") + " km"
    }

    /// "2024-03-14T..." → "14 Mar 2024"
    static func date(_ iso: String) -> String {
        let df = ISO8601DateFormatter()
        df.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var d = df.date(from: iso)
        if d == nil {
            df.formatOptions = [.withInternetDateTime]
            d = df.date(from: iso)
        }
        if d == nil, iso.count >= 10 {
            let plain = DateFormatter()
            plain.dateFormat = "yyyy-MM-dd"
            plain.timeZone = TimeZone(identifier: "UTC")
            d = plain.date(from: String(iso.prefix(10)))
        }
        guard let date = d else { return iso }
        let out = DateFormatter()
        out.dateFormat = "d MMM yyyy"
        out.timeZone = TimeZone(identifier: "UTC")
        out.locale = Locale(identifier: "en_US")
        return out.string(from: date)
    }

    /// Parse an ISO capture time (with or without fractional seconds).
    static func date(from iso: String) -> Date? {
        let df = ISO8601DateFormatter()
        df.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = df.date(from: iso) { return d }
        df.formatOptions = [.withInternetDateTime]
        return df.date(from: iso)
    }

    /// How long ago a moment was, in coarse human terms.
    static func ago(_ date: Date, now: Date = Date()) -> String {
        let secs = now.timeIntervalSince(date)
        if secs < 60 { return "just now" }
        if secs < 3600 { return "\(Int(secs / 60)) min ago" }
        if secs < 86400 { return "\(Int(secs / 3600)) h ago" }
        return "\(Int(secs / 86400)) d ago"
    }

    /// How long ago an ISO capture time was, in coarse human terms.
    static func ago(_ iso: String, now: Date = Date()) -> String {
        guard let d = date(from: iso) else { return "" }
        return ago(d, now: now)
    }
}
