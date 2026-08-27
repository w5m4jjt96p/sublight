import SwiftUI

// Near-Earth view — the native counterpart of src/ui/NearEarth.tsx. A geocentric
// log-radial radar of a curated satellite set, propagated live, extending the
// light-time ladder from the ISS (~1.4 ms) out to the deep fleet.

private let MOON_MEAN_KM: Double = 384_400
private let GEO_KM: Double = 42_164
private let C_KM_S: Double = 299_792.458
private let DENOM = log10((GEO_KM * 1.18) / Orbits.rEarth)

private func rNorm(_ rKm: Double) -> Double {
    min(1.06, max(0, log10(rKm / Orbits.rEarth) / DENOM))
}

private func bandColor(_ band: String) -> Color {
    switch band {
    case "LEO": return Theme.signal
    case "MEO": return Color(hex: "7FB9C8")
    case "GEO": return Color(hex: "9AA6B8")
    default: return Color(hex: "C6A2D8")
    }
}

struct NearEarthView: View {
    @ObservedObject var store: DataStore
    let onClose: () -> Void

    @State private var selected: Int?

    private var heroes: [SatelliteRecord] { store.satellites.filter { $0.isHero } }
    private var selSat: SatelliteRecord? { selected.flatMap { id in store.satellites.first { $0.norad == id } } }

    private var decayWatch: [(sat: SatelliteRecord, perigee: Double)] {
        var pairs: [(sat: SatelliteRecord, perigee: Double)] = []
        for s in store.satellites {
            let p = Orbits.perigeeAltitude(s)
            if p > 0 && p < 400 { pairs.append((sat: s, perigee: p)) }
        }
        pairs.sort { $0.perigee < $1.perigee }
        return Array(pairs.prefix(6))
    }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            VStack(spacing: 0) {
                bar
                radar
                panel
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Bar

    private var bar: some View {
        HStack(spacing: 14) {
            Button(action: onClose) {
                Text("← BACK").font(.mono(11)).tracking(1.5).foregroundColor(Theme.dim)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Near-Earth").font(.title(22)).foregroundColor(Theme.txt)
                Text("\(store.satellites.count) objects · live orbits · tap a dot")
                    .font(.mono(10)).foregroundColor(Theme.dim)
            }
            Spacer()
            Button(action: onClose) {
                Text("Deep fleet →").font(.mono(11)).foregroundColor(Theme.signal)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Theme.signal.opacity(0.08)))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.rule2, lineWidth: 1))
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
        .background(Theme.panel)
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .bottom)
    }

    // MARK: - Radar

    private var radar: some View {
        GeometryReader { geo in
            let size = geo.size
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { tl in
                Canvas { ctx, _ in draw(ctx, size: size, date: tl.date) }
            }
            .contentShape(Rectangle())
            .onTapGesture { loc in select(at: loc, size: size) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func geom(_ size: CGSize) -> (cx: CGFloat, cy: CGFloat, maxR: CGFloat, innerR: CGFloat) {
        (size.width / 2, size.height / 2, min(size.width, size.height) / 2 - 46, 24)
    }

    private func screenPoint(_ sat: SatelliteRecord, size: CGSize, date: Date) -> CGPoint {
        let g = geom(size)
        let st = Orbits.propagate(sat, atMs: date.timeIntervalSince1970 * 1000)
        let ang = atan2(st.y, st.x)
        let sr = g.innerR + CGFloat(rNorm(st.r)) * (g.maxR - g.innerR)
        return CGPoint(x: g.cx + CGFloat(cos(ang)) * sr, y: g.cy + CGFloat(sin(ang)) * sr)
    }

    private func select(at loc: CGPoint, size: CGSize) {
        let now = Date()
        var best: Int?
        var bestD: CGFloat = 22 * 22
        for s in store.satellites {
            let p = screenPoint(s, size: size, date: now)
            let d = (p.x - loc.x) * (p.x - loc.x) + (p.y - loc.y) * (p.y - loc.y)
            if d < bestD { bestD = d; best = s.norad }
        }
        selected = best
    }

    private func draw(_ ctx: GraphicsContext, size: CGSize, date: Date) {
        let g = geom(size)
        let toScreenR = { (rKm: Double) in g.innerR + CGFloat(rNorm(rKm)) * (g.maxR - g.innerR) }
        let center = CGPoint(x: g.cx, y: g.cy)

        // Reference rings.
        let rings: [(rKm: Double, label: String, lt: Double)] = [
            (Orbits.rEarth + 2000, "LEO", 2000 / C_KM_S),
            (26_560, "MEO · GPS", (26_560 - Orbits.rEarth) / C_KM_S),
            (GEO_KM, "GEO", (GEO_KM - Orbits.rEarth) / C_KM_S),
        ]
        for ring in rings {
            let sr = toScreenR(ring.rKm)
            let rect = CGRect(x: g.cx - sr, y: g.cy - sr, width: sr * 2, height: sr * 2)
            ctx.stroke(Path(ellipseIn: rect), with: .color(Color(hex: "2E3644")), lineWidth: 1)
            ctx.draw(Text(ring.label).font(.mono(10)).foregroundColor(Theme.dim),
                     at: CGPoint(x: g.cx + 8, y: g.cy - sr - 8), anchor: .leading)
            ctx.draw(Text(Fmt.lightScaled(ring.lt)).font(.mono(10)).foregroundColor(Theme.delay),
                     at: CGPoint(x: g.cx + 70, y: g.cy - sr - 8), anchor: .leading)
        }

        // Earth disc.
        let discRect = CGRect(x: g.cx - g.innerR, y: g.cy - g.innerR, width: g.innerR * 2, height: g.innerR * 2)
        ctx.fill(Path(ellipseIn: discRect),
                 with: .radialGradient(Gradient(colors: [Color(hex: "3E5A78"), Color(hex: "16283C")]),
                                       center: center, startRadius: 1, endRadius: g.innerR))

        // Satellites.
        let nowMs = date.timeIntervalSince1970 * 1000
        for s in store.satellites {
            let st = Orbits.propagate(s, atMs: nowMs)
            let ang = atan2(st.y, st.x)
            let sr = toScreenR(st.r)
            let x = g.cx + CGFloat(cos(ang)) * sr
            let y = g.cy + CGFloat(sin(ang)) * sr
            let isSel = s.norad == selected
            let rad: CGFloat = isSel ? 4.5 : (s.isHero ? 3 : 1.9)
            let dot = CGRect(x: x - rad, y: y - rad, width: rad * 2, height: rad * 2)
            let col = (isSel ? Theme.txt : bandColor(s.band)).opacity(isSel || s.isHero ? 1 : 0.72)
            ctx.fill(Path(ellipseIn: dot), with: .color(col))
            if isSel {
                let ring = CGRect(x: x - 9, y: y - 9, width: 18, height: 18)
                ctx.stroke(Path(ellipseIn: ring), with: .color(Theme.signal), lineWidth: 1.4)
                ctx.draw(Text(s.name).font(.mono(10)).foregroundColor(Theme.txt),
                         at: CGPoint(x: x + 12, y: y), anchor: .leading)
            }
        }

        // Moon reference (off-scale, pinned near the rim).
        let moonR = g.maxR + 20
        let mx = g.cx + CGFloat(cos(-0.6)) * moonR
        let my = g.cy + CGFloat(sin(-0.6)) * moonR
        ctx.fill(Path(ellipseIn: CGRect(x: mx - 3.5, y: my - 3.5, width: 7, height: 7)), with: .color(Theme.dim))
        ctx.draw(Text("Moon · not to scale").font(.mono(9)).foregroundColor(Theme.dim),
                 at: CGPoint(x: mx - 8, y: my - 4), anchor: .trailing)
        ctx.draw(Text("\(Fmt.lightScaled(MOON_MEAN_KM / C_KM_S)) (mean)").font(.mono(9)).foregroundColor(Theme.delay),
                 at: CGPoint(x: mx - 8, y: my + 8), anchor: .trailing)
    }

    // MARK: - Bottom panel

    private var panel: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let s = selSat {
                    detail(s)
                } else {
                    intro
                }
                if !decayWatch.isEmpty { decaySection }
            }
            .padding(18)
            .padding(.bottom, 24)
        }
        .frame(maxHeight: 300)
        .background(Theme.panel)
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .top)
    }

    private func detail(_ s: SatelliteRecord) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { tl in
            let st = Orbits.propagate(s, atMs: tl.date.timeIntervalSince1970 * 1000)
            VStack(alignment: .leading, spacing: 4) {
                Text(s.name).font(.title(22)).foregroundColor(Theme.txt)
                Text("NORAD \(s.norad) · \(s.band)\(s.isHero ? "" : " · \(s.group)")")
                    .font(.mono(10)).foregroundColor(Theme.dim)
                VStack(spacing: 0) {
                    statRow("Light-time to the ground below", Fmt.lightScaled(st.lightSeconds), accent: true)
                    statRow("Altitude", Fmt.kmValue(st.altitude))
                    statRow("Orbital speed", String(format: "%.2f km/s", st.speed))
                    statRow("Period", String(format: "%.1f min", st.periodMin))
                }
                .padding(.top, 8)
                if let note = s.note {
                    Text(note).font(.mono(12)).foregroundColor(Theme.dim).lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 6)
                }
                Button { selected = nil } label: {
                    Text("CLEAR SELECTION").font(.mono(10)).tracking(1.4).foregroundColor(Theme.dim)
                        .padding(.horizontal, 11).padding(.vertical, 7)
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(Theme.rule2, lineWidth: 1))
                }
                .padding(.top, 10)
            }
        }
    }

    private func statRow(_ label: String, _ value: String, accent: Bool = false) -> some View {
        HStack {
            Text(label).font(.mono(11)).foregroundColor(Theme.dim)
            Spacer()
            Text(value).font(.monoMed(accent ? 17 : 15)).foregroundColor(accent ? Theme.delay : Theme.txt)
        }
        .padding(.vertical, 9)
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .bottom)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("A curated slice of the objects circling Earth, propagated live from today's orbital elements. Tap any dot for its numbers.")
                .font(.mono(13)).foregroundColor(Theme.dim).lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
            if !heroes.isEmpty {
                let cols = [GridItem(.adaptive(minimum: 90), spacing: 6)]
                LazyVGrid(columns: cols, alignment: .leading, spacing: 6) {
                    ForEach(heroes) { h in
                        Button { selected = h.norad } label: {
                            Text(h.name).font(.mono(11)).foregroundColor(Theme.signal)
                                .padding(.horizontal, 9).padding(.vertical, 5)
                                .background(RoundedRectangle(cornerRadius: 5).fill(Theme.signal.opacity(0.07)))
                                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Theme.rule2, lineWidth: 1))
                        }
                    }
                }
            }
            Text("THE NEAR END OF THE LIGHT-TIME LADDER")
                .font(.mono(10)).tracking(1.2).foregroundColor(Theme.dim2).padding(.top, 4)
            ladderRow("ISS · LEO", 420 / C_KM_S)
            ladderRow("GPS · MEO", (26_560 - Orbits.rEarth) / C_KM_S)
            ladderRow("GEO", (GEO_KM - Orbits.rEarth) / C_KM_S)
            ladderRow("Moon (mean)", MOON_MEAN_KM / C_KM_S)
        }
    }

    private func ladderRow(_ label: String, _ lt: Double) -> some View {
        HStack {
            Text(label).font(.mono(12)).foregroundColor(Theme.txt)
            Spacer()
            Text(Fmt.lightScaled(lt)).font(.monoMed(14)).foregroundColor(Theme.delay)
        }
        .padding(.vertical, 8)
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .bottom)
    }

    private var decaySection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("DECAY WATCH").font(.mono(10)).tracking(1.4).foregroundColor(Theme.dim)
            Text("Lowest perigees in the set, closest to re-entry.")
                .font(.mono(11)).foregroundColor(Theme.dim2)
            ForEach(decayWatch, id: \.sat.norad) { d in
                Button { selected = d.sat.norad } label: {
                    HStack {
                        Text(d.sat.name).font(.mono(12)).foregroundColor(Theme.dim)
                        Spacer()
                        Text("\(Int(d.perigee.rounded())) km").font(.mono(12)).foregroundColor(Theme.txt)
                    }
                    .padding(.vertical, 7)
                    .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .bottom)
                }
                .buttonStyle(.plain)
            }
        }
    }
}
