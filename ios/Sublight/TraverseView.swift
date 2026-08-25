import SwiftUI

struct TraverseView: View {
    let track: RoverTrack
    let craftName: String
    let onClose: () -> Void

    @State private var scale: CGFloat = 0
    @State private var offset: CGPoint = .zero
    @State private var vp: CGSize = .zero
    @GestureState private var drag: CGSize = .zero
    @GestureState private var pinch: CGFloat = 1

    @State private var selSol: Int?
    @State private var sol: SolImages?
    @State private var loading = false
    @State private var lightbox: RoverImage?

    private var region: String { track.id == "curiosity" ? "Gale Crater" : "Jezero Crater" }
    private let D2R = Double.pi / 180

    // Web-Mercator slippy coords → image pixels (must match the pipeline).
    private func wx(_ lon: Double) -> Double { (lon + 180) / 360 }
    private func wy(_ lat: Double) -> Double { 0.5 - log(tan(.pi / 4 + lat * D2R / 2)) / (2 * .pi) }
    private func px(_ lon: Double) -> CGFloat {
        CGFloat((wx(lon) - track.frame.wxWest) / (track.frame.wxEast - track.frame.wxWest)) * CGFloat(track.w)
    }
    private func py(_ lat: Double) -> CGFloat {
        CGFloat((wy(lat) - track.frame.wyNorth) / (track.frame.wySouth - track.frame.wyNorth)) * CGFloat(track.h)
    }

    private var effScale: CGFloat { max(0.0001, scale * pinch) }
    private var effOffset: CGPoint {
        let c = CGPoint(x: vp.width / 2, y: vp.height / 2)
        return CGPoint(x: c.x - (c.x - offset.x) * pinch + drag.width,
                       y: c.y - (c.y - offset.y) * pinch + drag.height)
    }
    private func toScreen(_ lon: Double, _ lat: Double, _ off: CGPoint, _ s: CGFloat) -> CGPoint {
        CGPoint(x: off.x + px(lon) * s, y: off.y + py(lat) * s)
    }

    private func clampOffset(_ o: CGPoint, _ s: CGFloat) -> CGPoint {
        guard vp.width > 0 else { return o }
        let iw = CGFloat(track.w) * s, ih = CGFloat(track.h) * s
        let mx = min(90, vp.width * 0.5), my = min(90, vp.height * 0.5)
        return CGPoint(x: min(max(o.x, mx - iw), vp.width - mx),
                       y: min(max(o.y, my - ih), vp.height - my))
    }

    private func fit(_ size: CGSize) {
        let w = CGFloat(track.w), h = CGFloat(track.h)
        let cover = max(size.width / w, size.height / h)
        let contain = min(size.width / w, size.height / h)
        let s = min(cover, contain * 4)      // fill the screen, let the user pan
        scale = s
        offset = CGPoint(x: (size.width - w * s) / 2, y: (size.height - h * s) / 2)
    }

    /// Establish the fit from the Canvas's own size (reliable across layout).
    private func ensureFit(_ size: CGSize) {
        guard size.width > 0, size.height > 0 else { return }
        if vp != size || scale == 0 {
            DispatchQueue.main.async {
                if vp != size { vp = size }
                if scale == 0 { fit(size) }
            }
        }
    }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()

            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { tl in
                Canvas { ctx, size in
                    ensureFit(size)
                    draw(ctx, date: tl.date)
                }
            }
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .gesture(dragGesture.simultaneously(with: pinchGesture))
            .simultaneousGesture(tapGesture)

            VStack(spacing: 0) {
                header
                Spacer()
                if let selSol { solPanel(selSol) }
            }
        }
        .fullScreenCover(item: $lightbox) { img in RemotePhotoView(image: img) { lightbox = nil } }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: onClose) {
                HStack(spacing: 5) {
                    Image(systemName: "chevron.left").font(.system(size: 12, weight: .semibold))
                    Text("Back").font(.mono(13))
                }.foregroundColor(Theme.txt)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(craftName).font(.title(20)).foregroundColor(Theme.txt)
                Text("Surface traverse · \(region)").font(.mono(10)).foregroundColor(Theme.dim)
            }
            Spacer()
            if let d = track.distanceKm {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(String(format: "%.1f km", d)).font(.monoMed(14)).foregroundColor(Theme.txt)
                    Text("DRIVEN").font(.mono(8)).tracking(1.4).foregroundColor(Theme.dim2)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(Theme.panel.opacity(0.92))
    }

    // MARK: - Canvas

    private func draw(_ ctx: GraphicsContext, date: Date) {
        let off = effOffset, s = effScale
        // basemap
        if let ui = ImageStore.shared.image(DataStore.imageURL(track.image)) {
            let rect = CGRect(x: off.x, y: off.y, width: CGFloat(track.w) * s, height: CGFloat(track.h) * s)
            ctx.draw(Image(uiImage: ui), in: rect)
        }
        // drive path
        var path = Path()
        for (i, wp) in track.waypoints.enumerated() {
            let p = toScreen(wp.lon, wp.lat, off, s)
            if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        ctx.stroke(path, with: .color(.black.opacity(0.6)), style: StrokeStyle(lineWidth: 5, lineJoin: .round))
        ctx.stroke(path, with: .color(Theme.signal), style: StrokeStyle(lineWidth: 2.5, lineJoin: .round))

        // landing
        if let start = track.waypoints.first {
            let p = toScreen(start.lon, start.lat, off, s)
            ctx.stroke(Path(ellipseIn: CGRect(x: p.x - 5, y: p.y - 5, width: 10, height: 10)),
                       with: .color(Theme.txt), lineWidth: 1.5)
            ctx.draw(Text("Landing").font(.mono(10)).foregroundColor(Theme.txt),
                     at: CGPoint(x: p.x, y: p.y - 14))
        }
        // selected drive stop
        if let selSol, let wp = track.waypoints.first(where: { $0.sol == selSol }) {
            let p = toScreen(wp.lon, wp.lat, off, s)
            ctx.stroke(Path(ellipseIn: CGRect(x: p.x - 8, y: p.y - 8, width: 16, height: 16)),
                       with: .color(Theme.signal), lineWidth: 2)
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - 3, y: p.y - 3, width: 6, height: 6)), with: .color(Theme.signal))
        }
        // current position (pulsing)
        let cp = toScreen(track.current.lon, track.current.lat, off, s)
        let phase = CGFloat((date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2.4)) / 2.4)
        let pr = 5 + 12 * phase
        ctx.stroke(Path(ellipseIn: CGRect(x: cp.x - pr, y: cp.y - pr, width: pr * 2, height: pr * 2)),
                   with: .color(Theme.signal.opacity(Double(0.4 * (1 - phase)))), lineWidth: 1.5)
        ctx.fill(Path(ellipseIn: CGRect(x: cp.x - 5, y: cp.y - 5, width: 10, height: 10)), with: .color(Theme.signal))
        ctx.draw(Text("\(craftName)\(track.current.sol.map { " · sol \($0)" } ?? "")")
            .font(.mono(11)).foregroundColor(.white),
                 at: CGPoint(x: cp.x, y: cp.y - 16))
    }

    // MARK: - Gestures

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 4)
            .updating($drag) { v, st, _ in st = v.translation }
            .onEnded { v in
                offset = clampOffset(CGPoint(x: offset.x + v.translation.width, y: offset.y + v.translation.height), scale)
            }
    }
    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .updating($pinch) { v, st, _ in st = v }
            .onEnded { v in
                let contain = min(vp.width / CGFloat(track.w), vp.height / CGFloat(track.h))
                let newS = min(max(scale * v, contain * 0.9), max(contain * 8, 3))
                let ratio = newS / scale
                let c = CGPoint(x: vp.width / 2, y: vp.height / 2)
                offset = clampOffset(CGPoint(x: c.x - (c.x - offset.x) * ratio, y: c.y - (c.y - offset.y) * ratio), newS)
                scale = newS
            }
    }
    private var tapGesture: some Gesture {
        SpatialTapGesture().onEnded { v in selectNearest(v.location) }
    }

    private func selectNearest(_ loc: CGPoint) {
        var best: TrackWaypoint?
        var bd = CGFloat.infinity
        for wp in track.waypoints where wp.sol != nil {
            let p = toScreen(wp.lon, wp.lat, offset, scale)
            let d = hypot(p.x - loc.x, p.y - loc.y)
            if d < bd { bd = d; best = wp }
        }
        if let best, let s = best.sol, bd < 46 {
            selSol = s
            loadSol(s)
        } else {
            selSol = nil; sol = nil
        }
    }

    private func loadSol(_ s: Int) {
        sol = nil; loading = true
        Task {
            let result = await RoverImages.fetch(roverId: track.id, sol: s)
            await MainActor.run { self.sol = result; self.loading = false }
        }
    }

    // MARK: - Sol photo panel

    private func solPanel(_ s: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Sol \(s)").font(.titleSemi(15)).foregroundColor(Theme.txt)
                    Text(loading ? "loading frames…"
                         : sol.map { "\($0.count) raw frame\($0.count == 1 ? "" : "s")" } ?? "")
                        .font(.mono(10)).tracking(1).foregroundColor(Theme.delay)
                }
                Spacer()
                Button { selSol = nil; sol = nil } label: {
                    Image(systemName: "xmark").font(.system(size: 13)).foregroundColor(Theme.dim)
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    if loading {
                        ProgressView().tint(Theme.dim).frame(width: 120, height: 88)
                    } else if let sol, sol.images.isEmpty {
                        Text("No public frames for this sol.").font(.mono(11)).foregroundColor(Theme.dim)
                            .frame(height: 88)
                    }
                    ForEach(sol?.images ?? []) { img in
                        Button { lightbox = img } label: {
                            AsyncImage(url: img.thumb) { phase in
                                switch phase {
                                case .success(let image): image.resizable().aspectRatio(contentMode: .fill)
                                default: Rectangle().fill(Theme.rule)
                                }
                            }
                            .frame(width: 120, height: 88).clipped().cornerRadius(4)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Theme.rule2, lineWidth: 1))
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(14)
        .background(Theme.panel.opacity(0.95))
    }
}

// Full-screen viewer for a live (remote) rover frame.
private struct RemotePhotoView: View {
    let image: RoverImage
    let onClose: () -> Void
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            AsyncImage(url: image.full) { phase in
                switch phase {
                case .success(let img): img.resizable().aspectRatio(contentMode: .fit)
                case .empty: ProgressView().tint(.white)
                default: Text("Couldn't load image").font(.mono(12)).foregroundColor(Theme.dim)
                }
            }
            VStack {
                HStack {
                    Text("\(image.instrument.replacingOccurrences(of: "_", with: " "))\(image.sol > 0 ? " · sol \(image.sol)" : "")")
                        .font(.mono(11)).foregroundColor(Theme.dim)
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .medium)).foregroundColor(Theme.txt)
                            .padding(10).background(Circle().fill(Color.black.opacity(0.5)))
                    }
                }
                Spacer()
                Text("NASA/JPL-Caltech").font(.mono(9)).foregroundColor(Theme.dim2)
            }.padding(16)
        }
    }
}
