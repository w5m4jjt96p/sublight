import SwiftUI

// The feed — one chronological stream for the whole fleet, newest arrival first,
// the way a social timeline reads. Each post is a photo: the craft is the
// author, its location the place, the arrival the posted time, and the
// light-travel delay the honest twist underneath.
//
// The bundled snapshot paints instantly; then we pull each rover's most recently
// *published* frames live, so the top of the feed is what NASA put up minutes
// ago. Scrolling reveals a page at a time; "Load older photos" walks the rovers
// back a sol and re-merges, so the stream stays in date order.

// Full-screen photo viewer that works for both local (bundled) and remote
// (live) URLs, unlike the ImageStore-backed Lightbox.
struct PhotoViewer: View {
    let url: URL?
    let onClose: () -> Void
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let img): img.resizable().aspectRatio(contentMode: .fit)
                case .empty: ProgressView().tint(.white)
                default: Text("Couldn't load image").font(.mono(12)).foregroundColor(Theme.dim)
                }
            }
            VStack {
                HStack {
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .medium)).foregroundColor(.white)
                            .padding(10).background(Circle().fill(Color.black.opacity(0.5)))
                    }
                }
                Spacer()
            }.padding(16)
        }
    }
}

struct FeedPost: Identifiable {
    let id: String
    let craftName: String
    let location: String
    let avatar: URL?
    let thumb: URL?
    let full: URL?
    let caption: String        // "Sol 1969 · MCZ_RIGHT"
    let arrival: Date?         // when its light reached Earth
    let lightLine: String?
    let isRemote: Bool
}

/// A live rover we can page backwards through, sol by sol.
private struct RoverCursor {
    let id: String
    var nextSol: Int
    var pulledLatestSol = false
    var done = false
}

@MainActor
final class FeedStore: ObservableObject {
    @Published private(set) var posts: [FeedPost] = []
    @Published private(set) var loading = false
    @Published var visible = 6

    private var byCraft: [String: [FeedPost]] = [:]
    private var cursors: [String: RoverCursor] = [:]
    private var seeded = false
    let page = 6

    var canLoadOlder: Bool { cursors.values.contains { !$0.done } }

    private func remerge() {
        posts = byCraft.values.flatMap { $0 }
            .sorted { ($0.arrival ?? .distantPast) > ($1.arrival ?? .distantPast) }
    }

    /// Instant first paint from the bundled snapshot.
    func seed(from store: DataStore) {
        guard !seeded else { return }
        seeded = true
        for c in store.craft {
            guard let f = store.frames[c.id] else { continue }
            let owlt = c.eph.owltSeconds
            let light = owlt > 0 ? "Its light took \(Fmt.lightTime(owlt)) to cross the void" : nil
            let avatar = store.avatarURL(for: c.id)
            func arrival(_ iso: String) -> Date? { Fmt.date(from: iso)?.addingTimeInterval(owlt) }
            func cap(_ sol: Int?, _ instrument: String) -> String {
                sol.map { "Sol \($0) · \(instrument)" } ?? instrument
            }
            var list: [FeedPost] = [
                FeedPost(id: c.id + "-hero", craftName: c.name, location: c.reg.location, avatar: avatar,
                         thumb: DataStore.imageURL(f.file), full: DataStore.imageURL(f.full),
                         caption: cap(f.sol, f.instrument), arrival: arrival(f.capturedUtc),
                         lightLine: light, isRemote: false)
            ]
            for (i, r) in (f.recent ?? []).enumerated() {
                list.append(FeedPost(id: "\(c.id)-\(i)", craftName: c.name, location: c.reg.location, avatar: avatar,
                                     thumb: DataStore.imageURL(r.file), full: DataStore.imageURL(r.full),
                                     caption: cap(r.sol, r.instrument), arrival: arrival(r.capturedUtc),
                                     lightLine: light, isRemote: false))
            }
            byCraft[c.id] = list
            if let sol = f.sol { cursors[c.id] = RoverCursor(id: c.id, nextSol: sol) }
        }
        remerge()
    }

    /// Live-first: replace each rover's bundled posts with what NASA published most recently.
    func refreshLive(from store: DataStore) async {
        for c in store.craft where cursors[c.id] != nil {
            let images = await RoverImages.fetchLatest(roverId: c.id, limit: 48)
            guard !images.isEmpty else { continue }
            byCraft[c.id] = images.map { post(from: $0, craft: c, store: store) }
            let top = images.reduce(0) { max($0, $1.sol) }
            if top > 0 { cursors[c.id]?.nextSol = top }
            remerge()
        }
    }

    /// Walk every rover back one sol and re-merge, so the stream stays in date order.
    func loadOlder(from store: DataStore) async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        for c in store.craft {
            guard var cur = cursors[c.id], !cur.done else { continue }
            // The first pull completes the newest sol; later ones step back
            // (nextSol is decremented after each pull).
            var sol = cur.nextSol
            var images: [RoverImage] = []
            var tries = 0
            while tries < 8 && sol >= 0 {
                let d = await RoverImages.fetch(roverId: c.id, sol: sol, limit: 600)
                if !d.images.isEmpty { images = d.images; break }
                sol -= 1; tries += 1
            }
            let fresh = images.map { post(from: $0, craft: c, store: store) }
            if cur.pulledLatestSol {
                byCraft[c.id, default: []].append(contentsOf: fresh)
            } else {
                byCraft[c.id] = fresh          // completes the newest sol, no duplicates
                cur.pulledLatestSol = true
            }
            cur.nextSol = sol - 1
            if sol - 1 < 0 { cur.done = true }
            cursors[c.id] = cur
        }
        remerge()
        visible = min(visible + page, posts.count)
    }

    private func post(from img: RoverImage, craft: Craft, store: DataStore) -> FeedPost {
        let owlt = craft.eph.owltSeconds
        let caption = img.sol > 0 ? "Sol \(img.sol) · \(img.instrument)" : img.instrument
        return FeedPost(
            id: img.id.uuidString, craftName: craft.name, location: craft.reg.location,
            avatar: store.avatarURL(for: craft.id), thumb: img.thumb, full: img.full,
            caption: caption,
            arrival: Fmt.date(from: img.capturedUtc)?.addingTimeInterval(owlt),
            lightLine: owlt > 0 ? "Its light took \(Fmt.lightTime(owlt)) to cross the void" : nil,
            isRemote: true)
    }

    func revealMore() {
        if visible < posts.count { visible = min(visible + page, posts.count) }
    }
}

struct FeedView: View {
    @ObservedObject var store: DataStore
    @StateObject private var feed = FeedStore()
    @State private var viewer: URL?

    private var shown: [FeedPost] { Array(feed.posts.prefix(feed.visible)) }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            ScrollView {
                LazyVStack(spacing: 18) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { idx, p in
                        card(p).onAppear {
                            if idx >= feed.visible - 2 { feed.revealMore() }
                        }
                    }
                    if feed.visible < feed.posts.count || feed.canLoadOlder { loadButton }
                    archiveSection
                }
                .padding(.bottom, 100)
            }
        }
        .task {
            feed.seed(from: store)
            await feed.refreshLive(from: store)
        }
        .fullScreenCover(item: $viewer) { url in PhotoViewer(url: url) { viewer = nil } }
    }

    // MARK: - Post

    private func card(_ p: FeedPost) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Group {
                    if p.avatar != nil { BundleImage(url: p.avatar, contentMode: .fill) }
                    else { Circle().fill(Theme.rule2).overlay(Text(String(p.craftName.prefix(1))).font(.title(15)).foregroundColor(Theme.dim)) }
                }
                .frame(width: 36, height: 36).clipShape(Circle())
                .overlay(Circle().stroke(Theme.rule2, lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.craftName).font(.monoMed(14)).foregroundColor(Theme.txt)
                    Text(p.location).font(.mono(11)).foregroundColor(Theme.dim)
                }
                Spacer()
                if let a = p.arrival {
                    Text(Fmt.ago(a)).font(.mono(11)).foregroundColor(Theme.dim2)
                }
            }
            .padding(.horizontal, 14).padding(.bottom, 10)

            Button { viewer = p.full } label: {
                photoImage(p).frame(maxWidth: .infinity).background(Color.black)
            }.buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 6) {
                Text(p.caption).font(.mono(12)).foregroundColor(Theme.txt)
                if let l = p.lightLine {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.forward").font(.system(size: 9, weight: .bold)).foregroundColor(Theme.delay)
                        Text(l).font(.mono(11)).foregroundColor(Theme.delay)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14).padding(.top, 10)
        }
    }

    @ViewBuilder private func photoImage(_ p: FeedPost) -> some View {
        if p.isRemote {
            AsyncImage(url: p.thumb) { phase in
                switch phase {
                case .success(let img): img.resizable().aspectRatio(contentMode: .fit)
                case .empty: Rectangle().fill(Theme.panel).frame(height: 240)
                default: Rectangle().fill(Theme.rule).frame(height: 240)
                }
            }
        } else {
            BundleImage(url: p.thumb, contentMode: .fit)
        }
    }

    private var loadButton: some View {
        Button {
            if feed.visible < feed.posts.count { feed.revealMore() }
            else { Task { await feed.loadOlder(from: store) } }
        } label: {
            HStack(spacing: 8) {
                if feed.loading { ProgressView().tint(Theme.signal).scaleEffect(0.8) }
                Text(feed.loading ? "Loading…" : (feed.visible < feed.posts.count ? "Load more" : "Load older photos"))
                    .font(.mono(12)).foregroundColor(Theme.signal)
            }
            .padding(.horizontal, 16).padding(.vertical, 11)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.rule2, lineWidth: 1))
        }
        .buttonStyle(.plain).disabled(feed.loading)
        .padding(.top, 6)
    }

    // MARK: - Mission archive
    // Retired craft have no live arrival, so they'd sink out of a chronological
    // feed forever. They get their own compact shelf at the end instead.

    private var archiveCraft: [Craft] {
        store.craft.filter { store.frames[$0.id] == nil && store.archive[$0.id] != nil }
    }

    @ViewBuilder private var archiveSection: some View {
        if !archiveCraft.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("MISSION ARCHIVE").font(.mono(10)).tracking(1.5).foregroundColor(Theme.dim)
                    .padding(.horizontal, 14)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(archiveCraft, id: \.id) { c in
                            if let a = store.archive[c.id] {
                                Button { viewer = DataStore.imageURL(a.full) } label: {
                                    VStack(alignment: .leading, spacing: 6) {
                                        BundleImage(url: DataStore.imageURL(a.file), contentMode: .fill)
                                            .frame(width: 150, height: 110).clipped()
                                            .clipShape(RoundedRectangle(cornerRadius: 6))
                                        Text(c.name).font(.mono(11)).foregroundColor(Theme.txt).lineLimit(1)
                                        Text(a.title).font(.mono(9)).foregroundColor(Theme.dim)
                                            .lineLimit(1).frame(width: 150, alignment: .leading)
                                    }
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.horizontal, 14)
                }
            }
            .padding(.top, 26)
            .overlay(Rectangle().fill(Theme.rule).frame(height: 1).padding(.top, 8), alignment: .top)
        }
    }
}
