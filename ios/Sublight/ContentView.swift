import SwiftUI
import UserNotifications

@main
struct SublightApp: App {
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Set before any notification can be delivered, otherwise a tap that
        // launches the app cold is dropped and you land on the map.
        UNUserNotificationCenter.current().delegate = NotificationManager.shared
    }

    var body: some Scene {
        WindowGroup { ContentView() }
            .backgroundTask(.appRefresh(NotificationManager.taskId)) {
                await NotificationManager.shared.checkForNewImagery()
                NotificationManager.shared.scheduleRefresh()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .background { NotificationManager.shared.scheduleRefresh() }
            }
    }
}

enum NavTab { case gallery, mars, map, deepSky, settings }

struct ContentView: View {
    @StateObject private var store = DataStore()
    @StateObject private var controller = MapController()
    @StateObject private var weather = SpaceWeatherStore()
    @ObservedObject private var notifications = NotificationManager.shared
    @State private var selection: Selection?
    // The feed is what changes hour to hour, so that is where the app opens.
    // The map is still home: the Sun at the centre of the nav returns to it.
    @State private var tab: NavTab = .gallery
    @State private var showSearch = false
    @State private var marsTraverseTrack: RoverTrack?

    var body: some View {
        ZStack {
            MapView(store: store, controller: controller, selection: $selection)
                .ignoresSafeArea()

            if tab == .gallery {
                FeedView(store: store)
                    .transition(.opacity)
            } else if tab == .settings {
                SettingsView(store: store)
                    .transition(.opacity)
            } else if tab == .deepSky {
                DeepSkyView(store: store, onClose: { tab = .map })
                    .transition(.opacity)
            } else if tab == .mars {
                MarsGlobeView(
                    store: store,
                    marsLightSeconds: store.craft.first(where: { $0.id == "perseverance" })?.eph.owltSeconds,
                    onOpenTraverse: { id in
                        if let t = store.tracks[id] {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { marsTraverseTrack = t }
                        }
                    },
                    onClose: { tab = .map }
                )
                .transition(.opacity)
            }

            if tab == .map {
                SpaceWeatherChip(weather: weather)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .padding(.leading, 16).padding(.bottom, 96)
                    .transition(.opacity)
            }

            VStack(spacing: 0) {
                if tab == .map {
                    TopBar(onSearch: { showSearch = true })
                }
                Spacer()
                NavBar(tab: $tab, onMapReset: { controller.reset() })
            }
            // The nav measures its own bottom gap from the screen edge, so the
            // three margins around the capsule match. This has to sit on the
            // stack that is laid out against the safe area: on the NavBar
            // itself it silently does nothing, and the bar stays a
            // home-indicator inset above the bottom while the sides keep theirs.
            .ignoresSafeArea(.container, edges: .bottom)
        }
        .preferredColorScheme(.dark)
        .fullScreenCover(item: $marsTraverseTrack) { track in
            TraverseView(store: store, track: track,
                         craftName: store.craft.first(where: { $0.id == track.id })?.name ?? track.label,
                         onClose: { marsTraverseTrack = nil })
        }
        .sheet(item: $selection) { sel in
            switch sel {
            case .craft(let id): CraftDetail(store: store, id: id)
            case .body(let id): BodyDetail(store: store, id: id)
            }
        }
        .fullScreenCover(isPresented: $showSearch) {
            SearchView(store: store, onSelect: { sel in
                showSearch = false
                tab = .map
                if let w = store.currentWorld(for: sel) { controller.focus(world: w) }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { selection = sel }
            }, onClose: { showSearch = false })
        }
        .animation(.easeInOut(duration: 0.2), value: tab)
        // A tapped notification names a publication, so it opens the gallery.
        // `onAppear` covers a cold launch, where the tap is handled before this
        // view exists; `onChange` covers a tap while the app is already running.
        .onAppear { if notifications.pendingTarget != nil { tab = .gallery } }
        .onChange(of: notifications.pendingTarget) { _, target in
            if target != nil { tab = .gallery }
        }
    }
}

// MARK: - Top bar (map only): live clock + search, no logo

private struct TopBar: View {
    let onSearch: () -> Void
    var body: some View {
        HStack(alignment: .center) {
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                HStack(spacing: 6) {
                    Text(utc(ctx.date)).font(.mono(15)).foregroundColor(Theme.txt)
                    Text("UTC").font(.mono(11)).tracking(2).foregroundColor(Theme.dim2)
                }
            }
            Spacer()
            Button(action: onSearch) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundColor(Theme.txt)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(Theme.panel.opacity(0.6)).background(.ultraThinMaterial, in: Circle()))
                    .overlay(Circle().stroke(Theme.rule2, lineWidth: 1))
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 6)
    }

    private func utc(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: date)
    }
}

// MARK: - Space-weather chip (map)

private struct SpaceWeatherChip: View {
    @ObservedObject var weather: SpaceWeatherStore
    @State private var open = false

    var body: some View {
        if let w = weather.current {
            let s = SpaceWeatherStore.stormLabel(w)
            let dotColor: Color = s.level >= 3 ? Color(hex: "E5715B") : (s.level >= 1 ? Theme.delay : Theme.signal)
            Button { withAnimation(.easeInOut(duration: 0.15)) { open.toggle() } } label: {
                VStack(alignment: .leading, spacing: 9) {
                    HStack(spacing: 8) {
                        Circle().fill(dotColor).frame(width: 10, height: 10)
                            .shadow(color: dotColor.opacity(0.6), radius: 4)
                        Text(s.text).font(.mono(16)).foregroundColor(Theme.txt)
                        Text("Kp \(kp(w.kp))").font(.mono(16)).foregroundColor(Theme.dim)
                    }
                    if open {
                        HStack(spacing: 18) {
                            metric("G\(Int(w.gScale ?? 0))", "storm")
                            metric(w.windSpeed.map { "\(Int($0))" } ?? "—", "km/s wind")
                            metric(w.bz.map { "\($0 > 0 ? "+" : "")\(Int($0))" } ?? "—", "nT Bz")
                        }
                        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .top)
                        .padding(.top, 2)
                    }
                }
                .padding(.horizontal, 13).padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 8).fill(Theme.panel.opacity(0.82))
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8)))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.rule2, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(.monoMed(15)).foregroundColor(Theme.txt)
            Text(label).font(.mono(10.5)).foregroundColor(Theme.dim2)
        }
        .padding(.top, 4)
    }

    private func kp(_ v: Double?) -> String {
        guard let v else { return "—" }
        return v.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(v)) : String(format: "%.1f", v)
    }
}

// MARK: - Floating bottom nav bar

private struct NavBar: View {
    @Binding var tab: NavTab
    let onMapReset: () -> Void

    /// One inset for the three edges the capsule floats against, so the gap to
    /// the left, the right and the bottom of the screen reads the same. Set to
    /// clear the home indicator: below this the capsule reaches into the band
    /// the system claims for the home gesture and taps there turn unreliable.
    private let inset: CGFloat = 20

    var body: some View {
        HStack(spacing: 0) {
            item(.gallery, icon: "photo.on.rectangle.angled", label: "Gallery")
            item(.mars, icon: "globe", label: "Mars")
            mapButton
            item(.deepSky, icon: "sparkles", label: "Deep Sky")
            item(.settings, icon: "gearshape", label: "Settings")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            Capsule().fill(Theme.panel.opacity(0.82))
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(Theme.rule2, lineWidth: 1))
        )
        // Measured from the screen, not from the safe area: left, right and
        // bottom all clear by `inset`. Left on the safe area the bottom gap
        // would be the home-indicator inset, three times the side gap, and the
        // capsule would sit visibly high.
        .padding(.horizontal, inset)
        .padding(.bottom, inset)
    }

    /// Icons only. The five destinations are stable and the shapes carry them,
    /// so the words were repeating what the icon already said and setting the
    /// height of the whole bar. The label stays for VoiceOver.
    private func item(_ t: NavTab, icon: String, label: String) -> some View {
        Button { tab = t } label: {
            Image(systemName: icon)
                .font(.system(size: 23))
                .foregroundColor(tab == t ? Theme.signal : Theme.dim)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6).padding(.horizontal, 2)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(tab == t ? [.isButton, .isSelected] : .isButton)
    }

    private var mapButton: some View {
        Button {
            onMapReset()
            tab = .map
        } label: {
            Image(systemName: "sun.max.fill")
                .font(.system(size: 26))
                .foregroundColor(tab == .map ? Theme.void : Theme.txt)
                .frame(width: 54, height: 54)
                .background(
                    Circle().fill(tab == .map ? Theme.delay : Theme.rule2)
                        .shadow(color: tab == .map ? Theme.delay.opacity(0.5) : .clear, radius: 10)
                )
                .padding(.horizontal, 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Solar system map")
        .accessibilityAddTraits(tab == .map ? [.isButton, .isSelected] : .isButton)
    }
}

// MARK: - Settings (notifications + about)

private struct SettingsView: View {
    @ObservedObject var store: DataStore
    @StateObject private var tips = TipStore()
    @State private var notifOn = NotificationManager.shared.isEnabled
    @State private var busy = false

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("Settings").font(.title(34)).foregroundColor(Theme.txt)

                    // Notifications
                    VStack(alignment: .leading, spacing: 10) {
                        Text("NOTIFICATIONS").font(.mono(10)).tracking(1.5).foregroundColor(Theme.dim2)
                        Toggle(isOn: $notifOn) {
                            Text("New imagery alerts").font(.monoMed(15)).foregroundColor(Theme.txt)
                        }
                        .tint(Theme.signal)
                        .disabled(busy)
                        Text("A local alert each time a new post reaches the feed: one rover, one sol, however many frames it sent. Tapping it opens that post. iOS decides when to wake the app to check, so the timing is approximate.")
                            .font(.mono(12)).foregroundColor(Theme.dim).lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(16)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Theme.panel))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.rule2, lineWidth: 1))

                    supportSection

                    aboutSection
                }
                .padding(24)
                .padding(.bottom, 110) // clear the floating nav bar
            }
        }
        .onChange(of: notifOn) { _, on in
            Task {
                busy = true
                if on {
                    let ok = await NotificationManager.shared.enable()
                    if !ok { notifOn = false } // permission denied
                } else {
                    NotificationManager.shared.disable()
                }
                busy = false
            }
        }
    }

    @ViewBuilder private var supportSection: some View {
        if !tips.products.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("SUPPORT").font(.mono(10)).tracking(1.5).foregroundColor(Theme.dim2)
                if tips.didThank {
                    Text("Thank you. It genuinely helps.")
                        .font(.monoMed(14)).foregroundColor(Theme.delay)
                } else {
                    Text("Sublight is free, with no ads. If you'd like to support its development:")
                        .font(.mono(12)).foregroundColor(Theme.dim).lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    ForEach(tips.products, id: \.id) { p in
                        Button { Task { await tips.buy(p) } } label: {
                            VStack(spacing: 3) {
                                Text(p.displayName).font(.mono(10)).foregroundColor(Theme.dim)
                                if tips.purchasingID == p.id {
                                    ProgressView().tint(Theme.delay)
                                } else {
                                    Text(p.displayPrice).font(.monoMed(15)).foregroundColor(Theme.delay)
                                }
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(RoundedRectangle(cornerRadius: 6).fill(Theme.void))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.delay.opacity(0.5), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(tips.purchasingID != nil)
                    }
                }
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 8).fill(Theme.panel))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.rule2, lineWidth: 1))
        }
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Nothing you see is happening now.")
                .font(.title(22)).foregroundColor(Theme.delay)
            Text("A live map of the Sun, the planets, and the small fleet of robotic spacecraft still working across the solar system. Everything is drawn where the light says it is, as old as the time that light took to reach Earth. Tap anything to see how far its signal has travelled, and how long ago the view you're seeing actually left.")
                .font(.mono(14)).foregroundColor(Theme.txt).lineSpacing(6)
                .fixedSize(horizontal: false, vertical: true)
            Text("Data: JPL Horizons ephemerides, NASA mission imagery (Mars 2020, MSL, DSCOVR/EPIC) and the NASA Image Library. No value on screen is invented; missing data shows as “—”. Positions are a daily snapshot, interpolated in real time.")
                .font(.mono(11)).foregroundColor(Theme.dim).lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            Text("Product, interface, art direction and editorial by Florian. The code, on iOS and on the web alike, was written by Claude Code, Anthropic's coding agent, working to that direction.")
                .font(.mono(11)).foregroundColor(Theme.dim).lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            Text("Type: Stack Sans Notch & Roboto Mono, under the SIL Open Font License 1.1. NASA imagery and data are public domain, credited to their source. Sublight is an independent project, not affiliated with or endorsed by NASA or any space agency.")
                .font(.mono(11)).foregroundColor(Theme.dim).lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            Text("sublight.observer").font(.mono(11)).foregroundColor(Theme.dim2)
        }
    }
}
