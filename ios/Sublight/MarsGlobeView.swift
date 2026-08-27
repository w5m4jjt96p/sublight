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
                            Text(ageLine).font(.mono(12)).foregroundColor(Theme.delay)
                                .padding(.bottom, 14).multilineTextAlignment(.center)
                                .padding(.horizontal, 20)
                        }
                    }
                panel
            }
        }
        .preferredColorScheme(.dark)
    }

    private var ageLine: String {
        if let s = marsLightSeconds, s > 0 { return "You are seeing Mars as it was \(Fmt.lightTime(s)) ago." }
        return "Drag to spin. Tap a rover to follow its drive."
    }

    private var bar: some View {
        HStack(spacing: 16) {
            Button(action: onClose) {
                Text("← BACK").font(.mono(11)).tracking(1.5).foregroundColor(Theme.dim)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Mars").font(.title(22)).foregroundColor(Theme.txt)
                Text("\(sites.count) sites · drag to spin · tap a marker").font(.mono(10)).foregroundColor(Theme.dim)
            }
            Spacer()
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
        .background(Theme.panel)
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .bottom)
    }

    private var panel: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let p = selSite {
                    Text(p.site.name).font(.title(22)).foregroundColor(Theme.txt)
                    Text(subtitle(p)).font(.mono(11)).foregroundColor(Theme.dim)
                    Text(p.site.note).font(.mono(13)).foregroundColor(Theme.txt).lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 10) {
                        if let cid = p.site.craftId, store.tracks[cid] != nil {
                            Button { onOpenTraverse(cid) } label: {
                                Text("View surface traverse →").font(.mono(12)).foregroundColor(Theme.signal)
                                    .padding(.horizontal, 14).padding(.vertical, 10)
                                    .background(RoundedRectangle(cornerRadius: 6).fill(Theme.signal.opacity(0.08)))
                                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.rule2, lineWidth: 1))
                            }.buttonStyle(.plain)
                        }
                        Button { selected = nil } label: {
                            Text("CLEAR").font(.mono(10)).tracking(1.4).foregroundColor(Theme.dim)
                                .padding(.horizontal, 12).padding(.vertical, 9)
                                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Theme.rule2, lineWidth: 1))
                        }.buttonStyle(.plain)
                    }
                } else {
                    Text("A globe of Mars from the Viking mosaic, with every place we have landed marked on it. The two amber dots are Perseverance and Curiosity, at their current drive positions. Tap one to walk its route.")
                        .font(.mono(13)).foregroundColor(Theme.dim).lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 18) {
                        legend(Theme.delay, "Active rover")
                        legend(Theme.signal, "Lander")
                        legend(Theme.txt, "Landmark")
                    }
                }
            }
            .padding(18).padding(.bottom, 24)
        }
        .frame(maxHeight: 240)
        .background(Theme.panel)
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .top)
    }

    private func subtitle(_ p: PlacedMarsSite) -> String {
        let kind = p.site.kind == .feature ? "Landmark" : p.site.kind == .rover ? "Active rover" : "Lander"
        let yr = p.site.year.map { " · \($0)" } ?? ""
        return "\(kind)\(yr) · \(String(format: "%.1f", p.lat))°, \(String(format: "%.1f", p.lon))°E"
    }

    private func legend(_ c: Color, _ label: String) -> some View {
        HStack(spacing: 7) {
            Circle().fill(c).frame(width: 9, height: 9)
            Text(label).font(.mono(11)).foregroundColor(Theme.dim)
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
            globe.eulerAngles.x = max(-1.4, min(1.4, globe.eulerAngles.x + Float(t.y) * 0.006))
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
