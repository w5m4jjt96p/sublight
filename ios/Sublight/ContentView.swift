import SwiftUI
import UserNotifications

@main
struct SublightApp: App {
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Set before any notification can be delivered, otherwise a tap that
        // launches the app cold is dropped and you land on the map.
        UNUserNotificationCenter.current().delegate = NotificationManager.shared
        // AsyncImage goes through this cache, whose default is far too small for
        // a feed of 130 KB frames: scrolling back re-downloaded what was just
        // seen. NASA marks these frames cacheable for ten hours.
        URLCache.shared = URLCache(memoryCapacity: 64 * 1024 * 1024, diskCapacity: 512 * 1024 * 1024)
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
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var store = DataStore()
    @StateObject private var controller = MapController()
    @StateObject private var weather = SpaceWeatherStore()
    @ObservedObject private var notifications = NotificationManager.shared
    @State private var selection: Selection?
    // The photos are the product: the app opens on them, and they lead the nav.
    @State private var tab: NavTab = .gallery
    @State private var feedTop = 0
    @State private var showSearch = false
    @State private var marsTraverseTrack: RoverTrack?

    var body: some View {
        ZStack {
            MapView(store: store, controller: controller, selection: $selection, active: tab == .map)
                .ignoresSafeArea()

            // Stays mounted, so going to another tab and back returns to the same
            // place in the stream.
            FeedView(store: store, isActive: tab == .gallery, scrollToTop: feedTop)
                .opacity(tab == .gallery ? 1 : 0)
                .allowsHitTesting(tab == .gallery)
                .accessibilityHidden(tab != .gallery)

            if tab == .settings {
                SettingsView(store: store)
                    .transition(.opacity)
            } else if tab == .deepSky {
                DeepSkyView(store: store, onClose: { tab = .gallery })
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
                    onClose: { tab = .gallery }
                )
                .transition(.opacity)
            }

            if tab == .map {
                SpaceWeatherChip(weather: weather)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .padding(.leading, 16).padding(.bottom, 114)
                    .transition(.opacity)
            }

            VStack(spacing: 0) {
                if tab == .map {
                    TopBar(onSearch: { showSearch = true })
                }
                Spacer()
                NavBar(tab: $tab, onMapReset: { controller.reset() }, onFeedTop: { feedTop += 1 })
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
        .task { await store.refreshEphemeris() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.refreshEphemeris() } }
        }
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
                    // A measured value, so Geist Mono: fixed-width figures,
                    // and the clock does not jitter as it ticks.
                    Text(utc(ctx.date)).font(.monoMed(15)).foregroundColor(Theme.txt)
                    MicroLabel("UTC")
                }
            }
            Spacer()
            Button(action: onSearch) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundColor(Theme.txt)
                    .frame(width: 40, height: 40)
                    .glassPill()
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
            let dotColor: Color = s.level >= 3 ? Theme.alert : (s.level >= 1 ? Theme.delay : Theme.signal)
            Button { withAnimation(.easeInOut(duration: 0.15)) { open.toggle() } } label: {
                VStack(alignment: .leading, spacing: 9) {
                    HStack(spacing: 8) {
                        Circle().fill(dotColor).frame(width: 9, height: 9)
                            .background(Circle().fill(dotColor.opacity(0.18)).frame(width: 15, height: 15))
                        Text(s.text).font(.sansMed(15)).foregroundColor(Theme.txt)
                        Text("Kp \(kp(w.kp))").font(.mono(13)).foregroundColor(Theme.dim)
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
                .padding(.horizontal, 14).padding(.vertical, 11)
                .glass(radius: Theme.rM)
            }
            .buttonStyle(.plain)
        }
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(.monoMed(15)).foregroundColor(Theme.txt)
            MicroLabel(label)
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
    let onFeedTop: () -> Void

    /// One inset for the three edges the capsule floats against, so the gap to
    /// the left, the right and the bottom of the screen reads the same. Set to
    /// clear the home indicator: below this the capsule reaches into the band
    /// the system claims for the home gesture and taps there turn unreliable.
    private let inset: CGFloat = 20

    var body: some View {
        HStack(spacing: 0) {
            // The photos lead because they are home; tapping them there returns
            // to the top of the stream, the way every feed does.
            item(.gallery, icon: .gallery, label: "Photos")
            mapItem
            item(.mars, icon: .mars, label: "Mars")
            item(.deepSky, icon: .deepSky, label: "Deep Sky")
            // No drawn glyph for settings yet, so the system one stays.
            systemItem(.settings, systemName: "gearshape", label: "Settings")
        }
        .padding(6)
        .glassPill()
        // Measured from the screen, not from the safe area: left, right and
        // bottom all clear by `inset`. Left on the safe area the bottom gap
        // would be the home-indicator inset, three times the side gap, and the
        // capsule would sit visibly high.
        .padding(.horizontal, inset)
        .padding(.bottom, inset)
    }

    /// Icon over a short label, as on the web. The active item keeps its
    /// label in primary text, its icon in signal, on a faint white pill.
    private func cell<Icon: View>(_ on: Bool, label: String, @ViewBuilder icon: () -> Icon) -> some View {
        VStack(spacing: 3) {
            icon()
                .frame(height: 22)
                .foregroundColor(on ? Theme.signal : Theme.dim)
            Text(label)
                .font(.sansMed(11))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundColor(on ? Theme.txt : Theme.dim)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8).padding(.bottom, 7).padding(.horizontal, 2)
        .background(Capsule().fill(Color.white.opacity(on ? 0.1 : 0)))
        .contentShape(Capsule())
    }

    private func item(_ t: NavTab, icon: SublightIcon, label: String) -> some View {
        Button {
            if t == .gallery && tab == .gallery { onFeedTop() }
            tab = t
        } label: {
            cell(tab == t, label: label) { IconView(icon: icon, size: 22) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(tab == t ? [.isButton, .isSelected] : .isButton)
    }

    private func systemItem(_ t: NavTab, systemName: String, label: String) -> some View {
        Button { tab = t } label: {
            cell(tab == t, label: label) { Image(systemName: systemName).font(.system(size: 20)) }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(tab == t ? [.isButton, .isSelected] : .isButton)
    }

    /// Same shape as the other items, but it also recentres the map.
    private var mapItem: some View {
        Button {
            onMapReset()
            tab = .map
        } label: {
            cell(tab == .map, label: "Map") { IconView(icon: .sun, size: 22) }
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
                    Text("Settings").font(.titleSemi(34)).titleTracking(34).foregroundColor(Theme.txt)

                    // Notifications
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Notifications").font(.titleSemi(17)).foregroundColor(Theme.txt)
                        Toggle(isOn: $notifOn) {
                            Text("New imagery alerts").font(.sans(17)).foregroundColor(Theme.txt)
                        }
                        .tint(Theme.signal)
                        .disabled(busy)
                        Text("A local alert each time a new post reaches the feed: one rover, one sol, however many frames it sent. Tapping it opens that post. iOS decides when to wake the app to check, so the timing is approximate.")
                            .font(.sans(13)).foregroundColor(Theme.dim).lineSpacing(3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(18)
                    .card()

                    supportSection

                    aboutSection
                }
                .padding(24)
                .padding(.bottom, 128) // clear the floating nav bar
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
                Text("Support").font(.titleSemi(17)).foregroundColor(Theme.txt)
                if tips.didThank {
                    Text("Thank you. It genuinely helps.")
                        .font(.sansMed(15)).foregroundColor(Theme.txt)
                } else {
                    Text("Sublight is free, with no ads. If you'd like to support its development:")
                        .font(.sans(13)).foregroundColor(Theme.dim).lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    ForEach(tips.products, id: \.id) { p in
                        Button { Task { await tips.buy(p) } } label: {
                            VStack(spacing: 4) {
                                Text(p.displayName).font(.sans(13)).foregroundColor(Theme.dim)
                                    .lineLimit(1).minimumScaleFactor(0.8)
                                if tips.purchasingID == p.id {
                                    ProgressView().tint(Theme.txt)
                                } else {
                                    Text(p.displayPrice).font(.monoMed(15)).foregroundColor(Theme.txt)
                                }
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .card(radius: Theme.rM, fill: Theme.panel2)
                        }
                        .buttonStyle(.plain)
                        .disabled(tips.purchasingID != nil)
                    }
                }
            }
            .padding(18)
            .card()
        }
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Nothing you see is happening now.")
                .font(.titleSemi(24)).titleTracking(24).foregroundColor(Theme.txt)
                .fixedSize(horizontal: false, vertical: true)
            Text("A live map of the Sun, the planets, and the small fleet of robotic spacecraft still working across the solar system. Everything is drawn where the light says it is, as old as the time that light took to reach Earth. Tap anything to see how far its signal has travelled, and how long ago the view you're seeing actually left.")
                .font(.sans(17)).foregroundColor(Theme.txt).lineSpacing(6)
                .fixedSize(horizontal: false, vertical: true)
            Text("Data: JPL Horizons ephemerides, NASA mission imagery (Mars 2020, MSL, DSCOVR/EPIC) and the NASA Image Library. No value on screen is invented; missing data shows as “—”. Positions are a daily snapshot, interpolated in real time.")
                .font(.sans(13)).foregroundColor(Theme.dim).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            Text("Product, interface, art direction and editorial by Florian. The code, on iOS and on the web alike, was written by Claude Code, Anthropic's coding agent, working to that direction.")
                .font(.sans(13)).foregroundColor(Theme.dim).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            Text("Type: Geist and Geist Mono, under the SIL Open Font License 1.1. NASA imagery and data are public domain, credited to their source. Sublight is an independent project, not affiliated with or endorsed by NASA or any space agency.")
                .font(.sans(13)).foregroundColor(Theme.dim).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            Text("sublight.observer").font(.sans(13)).foregroundColor(Theme.dim2)
        }
    }
}
