import SwiftUI

enum Selection: Equatable, Hashable, Identifiable {
    case craft(String)
    case body(String)
    var id: String {
        switch self {
        case .craft(let x): return "c:" + x
        case .body(let x): return "b:" + x
        }
    }
}

// Visual style for a celestial body icon (constant screen size, like the web SVGs).
private struct BodyStyle {
    let radius: CGFloat
    let color: Color
    let ring: Bool
}

private let BODY_STYLES: [String: BodyStyle] = [
    "mercury": .init(radius: 4.5, color: Color(hex: "9A8F80"), ring: false),
    "venus":   .init(radius: 6.5, color: Color(hex: "D8B57A"), ring: false),
    "earth":   .init(radius: 7.0, color: Color(hex: "4B7FB5"), ring: false),
    "moon":    .init(radius: 3.2, color: Color(hex: "9A9A9A"), ring: false),
    "mars":    .init(radius: 5.5, color: Color(hex: "C1663F"), ring: false),
    "jupiter": .init(radius: 13.0, color: Color(hex: "CDA67F"), ring: false),
    "saturn":  .init(radius: 11.0, color: Color(hex: "D8C48F"), ring: true),
    "uranus":  .init(radius: 9.0, color: Color(hex: "9FD3D8"), ring: false),
    "neptune": .init(radius: 9.0, color: Color(hex: "4F6FD0"), ring: false),
]

private struct MapItem {
    let sel: Selection
    let world: CGPoint
    var screen: CGPoint
    let isCraft: Bool
}

private struct MapLayout {
    var items: [MapItem] = []
    var sunScreen: CGPoint = .zero
    var earthScreen: CGPoint?
}

private struct Star {
    let x: CGFloat      // 0..1 normalized
    let y: CGFloat
    let r: CGFloat
    let b: Double       // brightness
    let depth: CGFloat  // parallax factor
}

struct MapView: View {
    @ObservedObject var store: DataStore
    @ObservedObject var controller: MapController
    @Binding var selection: Selection?

    @State private var stars: [Star] = []

    @GestureState private var pan: CGSize = .zero
    @GestureState private var zoom: CGFloat = 1

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation(minimumInterval: 1.0 / 60.0)) { tl in
                Canvas { ctx, size in
                    let layout = computeLayout(size: size, date: tl.date,
                                               cam: effCam, scale: effScale)
                    draw(ctx, size: size, layout: layout, date: tl.date)
                }
            }
            .background(Theme.void)
            .contentShape(Rectangle())
            .gesture(panGesture(geo.size).simultaneously(with: zoomGesture))
            .simultaneousGesture(tapGesture(geo.size))
            .onAppear {
                if stars.isEmpty { stars = Self.makeStars(240) }
                controller.configure(fit: fit(geo.size))
            }
            .onChange(of: geo.size) { newSize in
                controller.configure(fit: fit(newSize))
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Derived camera (controller state + live gesture)

    private var effScale: CGFloat { max(0.0001, controller.scale * zoom) }
    private var effCam: CGPoint {
        CGPoint(x: controller.cam.x - pan.width / effScale,
                y: controller.cam.y - pan.height / effScale)
    }
    private var fitScale: CGFloat { controller.fitScale }

    private func fit(_ size: CGSize) -> CGFloat {
        min(size.width, size.height) * 0.44 / Projection.rMax
    }

    // MARK: - Gestures

    private func panGesture(_ size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 6)
            .updating($pan) { value, state, _ in state = value.translation }
            .onEnded { value in
                controller.cam.x -= value.translation.width / effScale
                controller.cam.y -= value.translation.height / effScale
            }
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .updating($zoom) { value, state, _ in state = value }
            .onEnded { value in
                controller.scale = min(max(controller.scale * value, fitScale * 0.6), fitScale * 90)
            }
    }

    private func tapGesture(_ size: CGSize) -> some Gesture {
        SpatialTapGesture()
            .onEnded { value in
                let layout = computeLayout(size: size, date: Date(),
                                           cam: effCam, scale: effScale)
                if let hit = hitTest(value.location, layout: layout) {
                    selection = hit
                } else {
                    selection = nil
                }
            }
    }

    // MARK: - Layout

    private func dayFraction(_ date: Date) -> Double {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let start = cal.startOfDay(for: date)
        return date.timeIntervalSince(start) / 86400
    }

    private func computeLayout(size: CGSize, date: Date, cam: CGPoint, scale: CGFloat) -> MapLayout {
        var layout = MapLayout()
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        func toScreen(_ w: CGPoint) -> CGPoint {
            CGPoint(x: center.x + (w.x - cam.x) * scale,
                    y: center.y + (w.y - cam.y) * scale)
        }
        let frac = dayFraction(date)
        layout.sunScreen = toScreen(.zero)

        // Planets
        var planetScreen: [String: CGPoint] = [:]
        var planetWorld: [String: CGPoint] = [:]
        for p in store.planets {
            let w = Projection.interp(auT: p.heliocentricAu, auN: p.heliocentricAuNextDay,
                                      lonT: p.eclipticLonDeg, lonN: p.eclipticLonDegNextDay, frac: frac)
            planetWorld[p.id] = w
            planetScreen[p.id] = toScreen(w)
        }
        // Keep the Moon a readable distance from Earth on screen.
        if let e = planetScreen["earth"], var m = planetScreen["moon"] {
            let dx = m.x - e.x, dy = m.y - e.y
            let d = max(0.0001, hypot(dx, dy))
            let minGap: CGFloat = 22
            if d < minGap {
                m = CGPoint(x: e.x + dx / d * minGap, y: e.y + dy / d * minGap)
                planetScreen["moon"] = m
            }
        }
        for p in store.planets {
            if let s = planetScreen[p.id], let w = planetWorld[p.id] {
                layout.items.append(MapItem(sel: .body(p.id), world: w, screen: s, isCraft: false))
            }
        }
        layout.earthScreen = planetScreen["earth"]

        // Craft
        var craftWorld: [(Craft, CGPoint, CGPoint)] = []
        for c in store.craft {
            let w = Projection.interp(auT: c.eph.heliocentricAu, auN: c.eph.heliocentricAuNextDay,
                                      lonT: c.eph.eclipticLonDeg, lonN: c.eph.eclipticLonDegNextDay, frac: frac)
            craftWorld.append((c, w, toScreen(w)))
        }

        // Cluster co-located craft, fan them out in screen space so all stay tappable.
        var used = [Bool](repeating: false, count: craftWorld.count)
        let clusterDist: CGFloat = 20
        for i in craftWorld.indices where !used[i] {
            var group = [i]
            used[i] = true
            for j in craftWorld.indices where !used[j] {
                let a = craftWorld[i].1, b = craftWorld[j].1
                if hypot(a.x - b.x, a.y - b.y) < clusterDist {
                    group.append(j); used[j] = true
                }
            }
            if group.count == 1 {
                let (c, w, s) = craftWorld[i]
                layout.items.append(MapItem(sel: .craft(c.id), world: w, screen: s, isCraft: true))
            } else {
                // Fan across an arc centred on the outward (anti-sun) direction.
                var cx: CGFloat = 0, cy: CGFloat = 0
                for g in group { cx += craftWorld[g].2.x; cy += craftWorld[g].2.y }
                let centroid = CGPoint(x: cx / CGFloat(group.count), y: cy / CGFloat(group.count))
                let outAngle = atan2(centroid.y - layout.sunScreen.y, centroid.x - layout.sunScreen.x)
                let spread: CGFloat = .pi * 0.62
                let radius: CGFloat = 30
                for (k, g) in group.enumerated() {
                    let t = group.count == 1 ? 0.5 : CGFloat(k) / CGFloat(group.count - 1)
                    let ang = outAngle - spread / 2 + spread * t
                    let s = CGPoint(x: centroid.x + cos(ang) * radius,
                                    y: centroid.y + sin(ang) * radius)
                    layout.items.append(MapItem(sel: .craft(craftWorld[g].0.id),
                                                world: craftWorld[g].1, screen: s, isCraft: true))
                }
            }
        }
        return layout
    }

    private func hitTest(_ p: CGPoint, layout: MapLayout) -> Selection? {
        var best: (Selection, CGFloat)?
        // Sun
        let sd = hypot(p.x - layout.sunScreen.x, p.y - layout.sunScreen.y)
        if sd < 30 { best = (.body("sun"), sd) }
        for item in layout.items {
            let d = hypot(p.x - item.screen.x, p.y - item.screen.y)
            let hitR: CGFloat = item.isCraft ? 26 : 24
            if d < hitR, best == nil || d < best!.1 {
                best = (item.sel, d)
            }
        }
        return best?.0
    }

    // MARK: - Draw

    private func draw(_ ctx: GraphicsContext, size: CGSize, layout: MapLayout, date: Date) {
        drawStars(ctx, size: size)
        drawSun(ctx, at: layout.sunScreen)

        // Signal path to the selected craft.
        if case let .craft(id)? = selection,
           let craft = layout.items.first(where: { $0.sel == .craft(id) }),
           let earth = layout.earthScreen {
            drawSignalPath(ctx, from: earth, to: craft.screen, date: date)
        }

        for item in layout.items {
            switch item.sel {
            case .body(let id): drawBody(ctx, id: id, at: item.screen)
            case .craft(let id): drawCraft(ctx, id: id, at: item.screen)
            }
        }
    }

    private func drawStars(_ ctx: GraphicsContext, size: CGSize) {
        let w = size.width, h = size.height
        let ox = effCam.x * effScale, oy = effCam.y * effScale
        let tw = Date().timeIntervalSinceReferenceDate
        for (i, s) in stars.enumerated() {
            var x = (s.x * w - ox * s.depth * 0.25).truncatingRemainder(dividingBy: w)
            if x < 0 { x += w }
            var y = (s.y * h - oy * s.depth * 0.25).truncatingRemainder(dividingBy: h)
            if y < 0 { y += h }
            let twinkle = 0.75 + 0.25 * sin(tw * 1.3 + Double(i))
            let rect = CGRect(x: x, y: y, width: s.r, height: s.r)
            ctx.fill(Path(ellipseIn: rect), with: .color(Theme.star.opacity(s.b * twinkle)))
        }
    }

    private func drawSun(_ ctx: GraphicsContext, at p: CGPoint) {
        let r: CGFloat = 22
        // Outer glow
        let glow = CGRect(x: p.x - r * 3, y: p.y - r * 3, width: r * 6, height: r * 6)
        ctx.fill(Path(ellipseIn: glow),
                 with: .radialGradient(Gradient(colors: [Theme.delay.opacity(0.28), .clear]),
                                       center: p, startRadius: r * 0.6, endRadius: r * 3))
        let disc = CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)
        ctx.fill(Path(ellipseIn: disc),
                 with: .radialGradient(Gradient(colors: [Color(hex: "FDE9C4"), Theme.delay, Color(hex: "C98A3B")]),
                                       center: CGPoint(x: p.x - r * 0.25, y: p.y - r * 0.25),
                                       startRadius: 1, endRadius: r * 1.3))
    }

    private func drawBody(_ ctx: GraphicsContext, id: String, at p: CGPoint) {
        guard let style = BODY_STYLES[id] else { return }
        let r = style.radius
        if style.ring {
            // Saturn ring
            let rw = r * 2.7, rh = r * 0.95
            let ringRect = CGRect(x: p.x - rw / 2, y: p.y - rh / 2, width: rw, height: rh)
            ctx.stroke(Path(ellipseIn: ringRect),
                       with: .color(Color(hex: "C9B784").opacity(0.8)), lineWidth: 2)
        }
        let disc = CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)
        let lit = style.color
        let dark = lit.opacity(0.55)
        ctx.fill(Path(ellipseIn: disc),
                 with: .radialGradient(Gradient(colors: [lit, dark]),
                                       center: CGPoint(x: p.x - r * 0.35, y: p.y - r * 0.35),
                                       startRadius: 0.5, endRadius: r * 1.25))
        if selection == .body(id) {
            drawSelectionRing(ctx, at: p, radius: r + 7)
        }
        drawLabel(ctx, text: bodyLabel(id), at: CGPoint(x: p.x, y: p.y + r + 9), color: Theme.dim)
    }

    private func bodyLabel(_ id: String) -> String {
        store.bodies[id]?.name ?? store.planetsById[id]?.name ?? id.capitalized
    }

    private func drawCraft(_ ctx: GraphicsContext, id: String, at p: CGPoint) {
        guard let craft = store.craft.first(where: { $0.id == id }) else { return }
        let selected = selection == .craft(id)

        if craft.isImaging, let url = store.heroThumb(for: id),
           let ui = ImageStore.shared.image(url) {
            let side: CGFloat = selected ? 40 : 32
            let rect = CGRect(x: p.x - side / 2, y: p.y - side / 2, width: side, height: side)
            let clip = Path(roundedRect: rect, cornerRadius: 5)
            ctx.drawLayer { layer in
                layer.clip(to: clip)
                layer.draw(Image(uiImage: ui), in: rect)
            }
            ctx.stroke(clip, with: .color(Theme.delay.opacity(selected ? 1 : 0.75)),
                       lineWidth: selected ? 2 : 1)
        } else {
            let c = markerColor(craft.reg.status)
            let side: CGFloat = selected ? 11 : 7
            let rect = CGRect(x: p.x - side / 2, y: p.y - side / 2, width: side, height: side)
            ctx.fill(Path(rect), with: .color(c))
            ctx.stroke(Path(rect), with: .color(Theme.void), lineWidth: 1)
        }

        if selected {
            drawSelectionRing(ctx, at: p, radius: (craft.isImaging ? 26 : 12))
        }
        // Labels: always for imaging craft; otherwise only when zoomed in or selected.
        if selected || craft.isImaging || effScale > fitScale * 1.4 {
            let dy: CGFloat = craft.isImaging ? 26 : 12
            drawLabel(ctx, text: craft.name, at: CGPoint(x: p.x, y: p.y + dy),
                      color: selected ? Theme.txt : Theme.dim)
        }
    }

    private func markerColor(_ status: String) -> Color {
        switch status {
        case "active", "cruise": return Theme.signal
        case "dormant": return Theme.dim
        default: return Theme.dead
        }
    }

    private func drawSelectionRing(_ ctx: GraphicsContext, at p: CGPoint, radius: CGFloat) {
        let rect = CGRect(x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2)
        ctx.stroke(Path(ellipseIn: rect), with: .color(Theme.signal.opacity(0.9)),
                   style: StrokeStyle(lineWidth: 1.5))
    }

    private func drawLabel(_ ctx: GraphicsContext, text: String, at p: CGPoint, color: Color) {
        let t = Text(text).font(.mono(9)).foregroundColor(color)
        ctx.draw(t, at: CGPoint(x: p.x, y: p.y + 4), anchor: .top)
    }

    private func drawSignalPath(_ ctx: GraphicsContext, from a: CGPoint, to b: CGPoint, date: Date) {
        var path = Path()
        path.move(to: a); path.addLine(to: b)
        ctx.stroke(path, with: .color(Theme.signal.opacity(0.45)),
                   style: StrokeStyle(lineWidth: 1, dash: [4, 5]))
        // Moving pulse from Earth toward the craft.
        let phase = CGFloat((date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2.2)) / 2.2)
        let px = a.x + (b.x - a.x) * phase
        let py = a.y + (b.y - a.y) * phase
        let dot = CGRect(x: px - 2.5, y: py - 2.5, width: 5, height: 5)
        ctx.fill(Path(ellipseIn: dot), with: .color(Theme.signal))
    }

    private static func makeStars(_ n: Int) -> [Star] {
        var rng = SystemRandomNumberGenerator()
        return (0..<n).map { _ in
            let depth = CGFloat.random(in: 0.2...1.0, using: &rng)
            return Star(x: .random(in: 0...1, using: &rng),
                        y: .random(in: 0...1, using: &rng),
                        r: CGFloat.random(in: 0.6...1.9, using: &rng) * (0.6 + depth * 0.6),
                        b: Double.random(in: 0.25...0.9, using: &rng) * (0.4 + Double(depth) * 0.6),
                        depth: depth)
        }
    }
}

// Cheap on-disk image cache so Canvas redraws don't re-read files each frame.
final class ImageStore {
    static let shared = ImageStore()
    private var cache: [String: UIImage] = [:]
    func image(_ url: URL?) -> UIImage? {
        guard let url else { return nil }
        if let c = cache[url.path] { return c }
        guard let img = UIImage(contentsOfFile: url.path) else { return nil }
        cache[url.path] = img
        return img
    }
}
