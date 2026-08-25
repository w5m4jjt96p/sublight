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

    /// How long ago an ISO capture time was, in coarse human terms.
    static func ago(_ iso: String, now: Date = Date()) -> String {
        let df = ISO8601DateFormatter()
        df.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var d = df.date(from: iso)
        if d == nil {
            df.formatOptions = [.withInternetDateTime]
            d = df.date(from: iso)
        }
        guard let date = d else { return "" }
        let secs = now.timeIntervalSince(date)
        if secs < 3600 { return "\(Int(secs / 60)) min ago" }
        if secs < 86400 { return "\(Int(secs / 3600)) h ago" }
        return "\(Int(secs / 86400)) d ago"
    }
}
