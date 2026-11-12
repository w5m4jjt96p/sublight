import SwiftUI
import SceneKit

// Native Mars globe (the iOS counterpart of src/ui/MarsGlobe.tsx). A real 3D
// sphere via SceneKit (an Apple system framework, no external dependency),
// textured with the Viking public-domain mosaic, with the rovers and landing
// sites plotted on the surface. Tapping a rover opens its surface traverse.

// Longitude offset aligning our areocentric-East site coordinates with
// SceneKit's sphere UV seam. Calibrated against Olympus Mons in the simulator.
private let MARS_LON0: Double = 0

struct PlacedMarsSite: Identifiable {
    let site: MarsSite
    let lat: Double
    let lon: Double
    var id: String { site.id }
}

struct MarsGlobeView: View {
    @ObservedObject var store: DataStore
    let marsLightSeconds: Double?
    let onOpenTraverse: (String) -> Void
    let onClose: () -> Void

    @State private var selected: String?

    private var sites: [PlacedMarsSite] {
        MARS_SITES.map { s in
            let t = s.craftId.flatMap { store.tracks[$0] }
            return PlacedMarsSite(site: s, lat: t?.current.lat ?? s.lat, lon: t?.current.lon ?? s.lon)
        }
    }
    private var selSite: PlacedMarsSite? { selected.flatMap { id in sites.first { $0.id == id } } }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            VStack(spacing: 0) {
                bar
                MarsSceneView(sites: sites, selected: $selected)
                    .overlay(alignment: .bottom) {
                        if selected == nil {
                            ageLine
                                .padding(.bottom, 14).multilineTextAlignment(.center)
                                .padding(.horizontal, 20)
                        }
                    }
                panel
            }
        }
        .preferredColorScheme(.dark)
    }

    /// Mars as it was one light-time ago: a micro-label, the value in amber.
    @ViewBuilder private var ageLine: some View {
        if let s = marsLightSeconds, s > 0 {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                MicroLabel("Light-time")
                Text(Fmt.lightTime(s)).font(.monoMed(13)).foregroundColor(Theme.delay)
            }
            .padding(.horizontal, 14).padding(.vertical, 8)
            .glassPill()
            .accessibilityElement(children: .combine)
        } else {
            Text("Drag to spin. Tap a rover to follow its drive.")
                .font(.sans(13)).foregroundColor(Theme.dim)
        }
    }

    // A tab root: the nav bar is the way out, so there is no back button here.
    private var bar: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Mars").font(.titleSemi(30)).titleTracking(30).foregroundColor(Theme.txt)
                (Text("\(sites.count)").font(.mono(12))
                    + Text(" sites · drag to spin · tap a marker").font(.sans(13)))
                    .foregroundColor(Theme.dim)
            }
            Spacer()
        }
        .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 12)
        .background(Theme.void)
    }

    private var panel: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let p = selSite {
                    Text(p.site.name).font(.titleSemi(22)).titleTracking(22).foregroundColor(Theme.txt)
                    subtitle(p).foregroundColor(Theme.dim)
                    Text(p.site.note).font(.sans(15)).foregroundColor(Theme.txt).lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 10) {
                        if let cid = p.site.craftId, store.tracks[cid] != nil {
                            // Tinted action: signal text on signal at 10%.
                            Button { onOpenTraverse(cid) } label: {
                                Label("View surface traverse", systemImage: "arrow.right")
                                    .labelStyle(TrailingIconLabel())
                                    .font(.sansMed(15)).foregroundColor(Theme.signal)
                                    .padding(.horizontal, 16).padding(.vertical, 10)
                                    .background(Capsule().fill(Theme.signal.opacity(0.1)))
                            }.buttonStyle(.plain)
                        }
                        Button { selected = nil } label: {
                            Text("Clear").font(.sansMed(15)).foregroundColor(Theme.txt)
                                .padding(.horizontal, 16).padding(.vertical, 10)
                                .glassPill()
                        }.buttonStyle(.plain)
                    }
                } else {
                    Text("A globe of Mars from the Viking mosaic, with every place we have landed marked on it. The two amber dots are Perseverance and Curiosity, at their current drive positions. Tap one to walk its route.")
                        .font(.sans(15)).foregroundColor(Theme.dim).lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 18) {
                        legend(Theme.delay, "Active rover")
                        legend(Theme.signal, "Lander")
                        legend(Theme.txt, "Landmark")
                    }
                }
            }
            // Clears the floating nav bar, which sits over the foot of this panel.
            .padding(20).padding(.bottom, 64)
        }
        .frame(maxHeight: 260)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: Theme.rL, topTrailingRadius: Theme.rL, style: .continuous)
                .fill(Theme.panel)
                .ignoresSafeArea(edges: .bottom)
        )
        .overlay(
            UnevenRoundedRectangle(topLeadingRadius: Theme.rL, topTrailingRadius: Theme.rL, style: .continuous)
                .stroke(Theme.rule, lineWidth: 1)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    /// Kind in Geist; the year and coordinates are values, so mono.
    private func subtitle(_ p: PlacedMarsSite) -> Text {
        let kind = p.site.kind == .feature ? "Landmark" : p.site.kind == .rover ? "Active rover" : "Lander"
        let yr = p.site.year.map { " · \($0)" } ?? ""
        let coords = "\(String(format: "%.1f", p.lat))°, \(String(format: "%.1f", p.lon))°E"
        return Text(kind).font(.sans(13))
            + Text(yr).font(.mono(12))
            + Text(" · ").font(.sans(13))
            + Text(coords).font(.mono(12))
    }

    private func legend(_ c: Color, _ label: String) -> some View {
        HStack(spacing: 7) {
            Circle().fill(c).frame(width: 8, height: 8)
            Text(label).font(.sans(13)).foregroundColor(Theme.dim)
        }
    }
}

/// Title first, icon after: "View surface traverse →".
private struct TrailingIconLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.title
            configuration.icon.font(.system(size: 13, weight: .semibold))
        }
    }
}

// MARK: - SceneKit sphere

struct MarsSceneView: UIViewRepresentable {
    let sites: [PlacedMarsSite]
    @Binding var selected: String?

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> SCNView {
        let v = SCNView()
        v.backgroundColor = .clear
        v.antialiasingMode = .multisampling4X
        v.allowsCameraControl = false
        v.autoenablesDefaultLighting = false

        let scene = SCNScene()
        v.scene = scene

        let globe = SCNNode()
        scene.rootNode.addChildNode(globe)

        let sphere = SCNSphere(radius: 1.0)
        sphere.segmentCount = 96
        let mat = SCNMaterial()
        if let url = Bundle.main.url(forResource: "mars-globe", withExtension: "jpg", subdirectory: "bodies"),
           let img = UIImage(contentsOfFile: url.path) {
            mat.diffuse.contents = img
        } else {
            mat.diffuse.contents = UIColor(Color(hex: "9A5334"))
        }
        mat.lightingModel = .lambert
        // Sharpen the surface at oblique/zoomed angles (mipmaps + anisotropy).
        mat.diffuse.mipFilter = .linear
        mat.diffuse.magnificationFilter = .linear
        mat.diffuse.minificationFilter = .linear
        mat.diffuse.maxAnisotropy = 16
        sphere.firstMaterial = mat
        globe.addChildNode(SCNNode(geometry: sphere))

        for s in sites {
            globe.addChildNode(Self.markerNode(for: s))
        }
        context.coordinator.globe = globe

        let cam = SCNNode()
        cam.camera = SCNCamera()
        cam.camera?.fieldOfView = 40
        cam.position = SCNVector3(0, 0, 3.4)
        scene.rootNode.addChildNode(cam)
        v.pointOfView = cam
        context.coordinator.camNode = cam

        let key = SCNNode()
        key.light = SCNLight(); key.light!.type = .omni; key.light!.intensity = 1050
        key.position = SCNVector3(-3.5, 2.2, 4)
        scene.rootNode.addChildNode(key)
        let amb = SCNNode()
        amb.light = SCNLight(); amb.light!.type = .ambient; amb.light!.intensity = 170
        scene.rootNode.addChildNode(amb)

        // Face a nice hemisphere (Tharsis / rovers). Static so markers stay
        // tappable; explicit gestures below handle rotate + zoom.
        globe.eulerAngles = SCNVector3(0, Float(200.0 * Double.pi / 180.0), 0)

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.onTap(_:)))
        v.addGestureRecognizer(tap)
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.onPan(_:)))
        pan.maximumNumberOfTouches = 1 // leave two-finger gestures to pinch
        v.addGestureRecognizer(pan)
        let pinch = UIPinchGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.onPinch(_:)))
        v.addGestureRecognizer(pinch)
        context.coordinator.scnView = v
        return v
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.apply(selected: selected)
    }

    /// Unit-sphere position for (lat, lonEast). r>1 lifts the marker onto the surface.
    static func spherePos(lat: Double, lon: Double, r: Double = 1.015) -> SCNVector3 {
        let phi = lat * .pi / 180
        let lam = (lon + MARS_LON0) * .pi / 180
        return SCNVector3(Float(r * cos(phi) * sin(lam)),
                          Float(r * sin(phi)),
                          Float(r * cos(phi) * cos(lam)))
    }

    static func markerNode(for p: PlacedMarsSite) -> SCNNode {
        let color: UIColor
        switch p.site.kind {
        case .rover: color = UIColor(Theme.delay)
        case .lander: color = UIColor(Theme.signal)
        case .feature: color = UIColor(Theme.txt)
        }
        let dot = SCNSphere(radius: p.site.kind == .rover ? 0.032 : 0.026)
        let m = SCNMaterial(); m.diffuse.contents = color; m.lightingModel = .constant
        m.emission.contents = color
        dot.firstMaterial = m
        let node = SCNNode(geometry: dot)
        node.name = "marker:\(p.id)"
        node.position = spherePos(lat: p.lat, lon: p.lon)
        return node
    }

    final class Coordinator: NSObject {
        var parent: MarsSceneView
        weak var scnView: SCNView?
        weak var globe: SCNNode?
        weak var camNode: SCNNode?
        private var pinchStartZ: Float = 3.4

        init(_ parent: MarsSceneView) { self.parent = parent }

        @objc func onPan(_ g: UIPanGestureRecognizer) {
            guard let globe else { return }
            let t = g.translation(in: g.view)
            g.setTranslation(.zero, in: g.view)
            globe.eulerAngles.y += Float(t.x) * 0.006
            // Grab-and-drag: pulling down should bring the surface down, so the
            // vertical component is negated (SceneKit's +X rotation is the other way).
            globe.eulerAngles.x = max(-1.4, min(1.4, globe.eulerAngles.x - Float(t.y) * 0.006))
        }

        @objc func onPinch(_ g: UIPinchGestureRecognizer) {
            guard let cam = camNode else { return }
            if g.state == .began { pinchStartZ = cam.position.z }
            cam.position.z = max(2.0, min(5.0, pinchStartZ / Float(g.scale)))
        }

        func apply(selected: String?) {
            guard let globe else { return }
            for child in globe.childNodes {
                guard let name = child.name, name.hasPrefix("marker:") else { continue }
                let isSel = "marker:\(selected ?? "")" == name
                child.scale = isSel ? SCNVector3(1.9, 1.9, 1.9) : SCNVector3(1, 1, 1)
            }
        }

        @objc func onTap(_ g: UITapGestureRecognizer) {
            guard let v = scnView else { return }
            let pt = g.location(in: v)
            let hits = v.hitTest(pt, options: [.searchMode: SCNHitTestSearchMode.all.rawValue])
            var picked: String?
            for h in hits {
                if let name = h.node.name, name.hasPrefix("marker:") {
                    picked = String(name.dropFirst("marker:".count))
                    break
                }
            }
            DispatchQueue.main.async { self.parent.selected = picked }
        }
    }
}
