import SwiftUI

@main
struct SublightApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    @StateObject private var store = DataStore()
    @StateObject private var controller = MapController()
    @State private var selection: Selection?
    @State private var showGallery = false
    @State private var showSearch = false
    @State private var showAbout = false

    var body: some View {
        ZStack {
            MapView(store: store, controller: controller, selection: $selection)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Masthead(onSearch: { showSearch = true },
                         onGallery: { showGallery = true },
                         onAbout: { showAbout = true })
                Spacer()
                HUD(controller: controller)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(item: $selection) { sel in
            switch sel {
            case .craft(let id): CraftDetail(store: store, id: id)
            case .body(let id): BodyDetail(store: store, id: id)
            }
        }
        .fullScreenCover(isPresented: $showGallery) {
            GalleryView(store: store) { showGallery = false }
        }
        .fullScreenCover(isPresented: $showSearch) {
            SearchView(store: store, onSelect: { sel in
                showSearch = false
                if let w = store.currentWorld(for: sel) { controller.focus(world: w) }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { selection = sel }
            }, onClose: { showSearch = false })
        }
        .sheet(isPresented: $showAbout) { AboutView() }
    }
}

// MARK: - Masthead

private struct Masthead: View {
    let onSearch: () -> Void
    let onGallery: () -> Void
    let onAbout: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            BundleImage(url: DataStore.imageURL("sublight-wordmark.png"), contentMode: .fit)
                .frame(height: 16)
                .frame(width: 77)

            Spacer()

            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                VStack(alignment: .trailing, spacing: 1) {
                    Text(utc(ctx.date)).font(.mono(11)).foregroundColor(Theme.txt)
                    Text("UTC").font(.mono(8)).tracking(2).foregroundColor(Theme.dim2)
                }
            }

            iconButton("magnifyingglass", action: onSearch)
            iconButton("square.grid.2x2", action: onGallery)
            iconButton("info.circle", action: onAbout)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            Theme.void.opacity(0.82)
                .background(.ultraThinMaterial)
                .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .bottom)
        )
    }

    private func iconButton(_ name: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name)
                .font(.system(size: 15, weight: .regular))
                .foregroundColor(Theme.dim)
                .frame(width: 34, height: 34)
        }
    }

    private func utc(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: date)
    }
}

// MARK: - HUD

private struct HUD: View {
    @ObservedObject var controller: MapController

    var body: some View {
        HStack(spacing: 0) {
            Button { controller.reset() } label: {
                HStack(spacing: 6) {
                    Image(systemName: "scope").font(.system(size: 11))
                    Text("Whole system").font(.mono(11))
                }
                .foregroundColor(Theme.txt)
                .padding(.horizontal, 12).padding(.vertical, 9)
            }
            divider
            Button { controller.zoom(0.7) } label: {
                Image(systemName: "minus").font(.system(size: 13)).foregroundColor(Theme.txt)
                    .frame(width: 38, height: 36)
            }
            divider
            Button { controller.zoom(1.4) } label: {
                Image(systemName: "plus").font(.system(size: 13)).foregroundColor(Theme.txt)
                    .frame(width: 38, height: 36)
            }
        }
        .background(
            Capsule().fill(Theme.panel.opacity(0.9))
                .overlay(Capsule().stroke(Theme.rule2, lineWidth: 1))
        )
        .padding(.bottom, 28)
    }

    private var divider: some View {
        Rectangle().fill(Theme.rule2).frame(width: 1, height: 22)
    }
}

// MARK: - About

private struct AboutView: View {
    var body: some View {
        ZStack {
            Theme.panel.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Sublight").font(.title(40)).foregroundColor(Theme.txt)
                    Text("Nothing you see is happening now.")
                        .font(.title(22)).foregroundColor(Theme.delay)
                    Text("This is a live map of the Sun, the planets, and the small fleet of robotic spacecraft still working across the solar system. Everything is drawn where the light says it is — as old as the time that light took to reach Earth. Tap anything to see how far its signal has travelled, and how long ago the view you're seeing actually left.")
                        .font(.mono(14)).foregroundColor(Theme.txt).lineSpacing(6)
                        .fixedSize(horizontal: false, vertical: true)
                    Divider().background(Theme.rule)
                    Text("Data: JPL Horizons ephemerides, NASA mission imagery (Mars 2020, MSL, DSCOVR/EPIC) and the NASA Image Library. No value on screen is invented — missing data shows as “—”. Positions are a daily snapshot, interpolated in real time.")
                        .font(.mono(11)).foregroundColor(Theme.dim).lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Type: Stack Sans Notch & Roboto Mono, under the SIL Open Font License 1.1 (bundled in the app). NASA imagery and data are public domain, credited to their source. Sublight is an independent project, not affiliated with or endorsed by NASA or any space agency.")
                        .font(.mono(11)).foregroundColor(Theme.dim).lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("sublight.observer").font(.mono(11)).foregroundColor(Theme.dim2)
                }
                .padding(24)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.panel)
    }
}
