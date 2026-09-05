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
    let craftId: String
    let craftName: String
    let location: String
    let avatar: URL?
    let thumb: URL?
    let full: URL?
    let caption: String        // "Sol 1969 · MCZ_RIGHT"
    let sol: Int?              // the rover's own day — the grouping key
    let arrival: Date?         // when its light reached Earth
    let lightLine: String?
    let isRemote: Bool
}

/// Every frame a craft sent on the same day is one publication, swipeable —
/// a rover doesn't post 48 times, it posts a day's worth of looking around.
struct FeedGroup: Identifiable {
    let id: String             // craftId + arrival day
    let craftName: String
    let location: String
    let avatar: URL?
    let lightLine: String?
    let newest: Date?
    let posts: [FeedPost]      // newest first within the day
}

/// One publication: a craft's frames from a single sol. These are usually a
/// real sequence — EPIC watching the Earth turn through a day, a rover camera
/// sweeping a scene — so the frame is swapped in place with no transition at
/// all: run through them and they read as motion, the way a flipbook does.
/// Drag the thumbnail strip (or the photo) to scrub, or hit play to let it run.
struct FeedGroupCard: View {
    let group: FeedGroup
    let onOpen: (URL?) -> Void

    @State private var index = 0
    @State private var playing = false
    @State private var dragAnchor: Int?

    private var count: Int { group.posts.count }
    private func clamp(_ i: Int) -> Int { min(max(i, 0), max(count - 1, 0)) }
    private var current: FeedPost? { group.posts.indices.contains(clamp(index)) ? group.posts[clamp(index)] : nil }

    var body: some View {
        VStack(spacing: 0) {
            header
            stage
            if count > 1 { strip }
            footer
        }
        // Only ticks while playing, and restarts cleanly when it's toggled.
        .task(id: playing) {
            guard playing, count > 1 else { return }
            while !Task.isCancelled && playing {
                try? await Task.sleep(nanoseconds: 110_000_000)
                if playing { index = (clamp(index) + 1) % count }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Group {
                if group.avatar != nil { BundleImage(url: group.avatar, contentMode: .fill) }
                else { Circle().fill(Theme.rule2).overlay(Text(String(group.craftName.prefix(1))).font(.title(15)).foregroundColor(Theme.dim)) }
            }
            .frame(width: 36, height: 36).clipShape(Circle())
            .overlay(Circle().stroke(Theme.rule2, lineWidth: 1))
            VStack(alignment: .leading, spacing: 2) {
                Text(group.craftName).font(.monoMed(14)).foregroundColor(Theme.txt)
                Text(group.location).font(.mono(11)).foregroundColor(Theme.dim)
            }
            Spacer()
            if let n = group.newest {
                Text(Fmt.ago(n)).font(.mono(11)).foregroundColor(Theme.dim2)
            }
        }
        .padding(.horizontal, 14).padding(.bottom, 10)
    }

    private var stage: some View {
        ZStack {
            Color.black
            if let p = current { FeedPhoto(post: p) }
        }
        .frame(height: 380)
        .clipped()
        .contentShape(Rectangle())
        .overlay(alignment: .topTrailing) {
            if count > 1 {
                Text("\(clamp(index) + 1)/\(count)")
                    .font(.mono(11)).foregroundColor(.white)
                    .padding(.horizontal, 9).padding(.vertical, 5)
                    .background(Capsule().fill(Color.black.opacity(0.55)))
                    .padding(10)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if count > 1 {
                Button { playing.toggle() } label: {
                    Image(systemName: playing ? "pause.fill" : "play.fill")
                        .font(.system(size: 11, weight: .bold)).foregroundColor(.white)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.black.opacity(0.55)))
                }
                .buttonStyle(.plain).padding(10)
            }
        }
        // Dragging across the photo scrubs; a tap opens the full-screen viewer.
        // `simultaneousGesture` + a horizontal-dominance guard so a vertical
        // swipe on a photo still scrolls the feed instead of being swallowed.
        .simultaneousGesture(
            DragGesture(minimumDistance: 12)
                .onChanged { v in
                    guard abs(v.translation.width) > abs(v.translation.height) else { return }
                    if dragAnchor == nil { dragAnchor = clamp(index); playing = false }
                    index = clamp((dragAnchor ?? 0) + Int((-v.translation.width / 26).rounded()))
                }
                .onEnded { _ in dragAnchor = nil }
        )
        .onTapGesture { if let p = current { onOpen(p.full) } }
    }

    /// The whole sequence at a glance; drag anywhere along it to run through.
    private var strip: some View {
        GeometryReader { geo in
            HStack(spacing: 2) {
                ForEach(Array(group.posts.enumerated()), id: \.element.id) { i, p in
                    FeedPhoto(post: p, contentMode: .fill)
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .clipped()
                        .opacity(i == clamp(index) ? 1 : 0.4)
                        .overlay(
                            RoundedRectangle(cornerRadius: 2)
                                .stroke(i == clamp(index) ? Theme.signal : .clear, lineWidth: 1)
                        )
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        playing = false
                        let ratio = max(0, min(1, v.location.x / max(geo.size.width, 1)))
                        index = Int((ratio * CGFloat(max(count - 1, 1))).rounded())
                    }
            )
        }
        .frame(height: 34)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Color.black.opacity(0.55))
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let p = current {
                Text(p.caption).font(.mono(12)).foregroundColor(Theme.txt)
            }
            if let l = group.lightLine {
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

/// A single frame: bundled ones come from the app bundle, live ones over the wire.
struct FeedPhoto: View {
    let post: FeedPost
    var contentMode: ContentMode = .fit
    var body: some View {
        if post.isRemote {
            AsyncImage(url: post.thumb) { phase in
                switch phase {
                case .success(let img): img.resizable().aspectRatio(contentMode: contentMode)
                case .empty: ProgressView().tint(Theme.dim)
                default: Rectangle().fill(Theme.rule)
                }
            }
        } else {
            BundleImage(url: post.thumb, contentMode: contentMode)
        }
    }
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
    @Published private(set) var groups: [FeedGroup] = []
    @Published private(set) var loading = false
    @Published var visible = 4

    private var byCraft: [String: [FeedPost]] = [:]
    private var cursors: [String: RoverCursor] = [:]
    private var seeded = false
    let page = 4

    var canLoadOlder: Bool { cursors.values.contains { !$0.done } }

    private static let dayFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    /// Flatten every craft's posts into one stream, newest arrival first, then
    /// fold each craft's same-day frames into a single swipeable publication.
    private func remerge() {
        let flat = byCraft.values.flatMap { $0 }
            .sorted { ($0.arrival ?? .distantPast) > ($1.arrival ?? .distantPast) }

        var buckets: [String: [FeedPost]] = [:]
        var order: [String] = []
        for p in flat {
            // A sol is the rover's own day; anything without one (EPIC) falls
            // back to the calendar day. Grouping on the sol also stops a batch
            // from being split in two by an arbitrary UTC midnight.
            let day = p.sol.map { "sol\($0)" }
                ?? p.arrival.map { Self.dayFmt.string(from: $0) }
                ?? "archive"
            let key = "\(p.craftId)|\(day)"
            if buckets[key] == nil { order.append(key) }
            buckets[key, default: []].append(p)
        }
        // `flat` is newest-first, so first appearance orders the groups and each
        // bucket is already newest-first inside its day.
        groups = order.compactMap { key in
            guard let items = buckets[key], let head = items.first else { return nil }
            return FeedGroup(id: key, craftName: head.craftName, location: head.location,
                             avatar: head.avatar, lightLine: head.lightLine,
                             newest: head.arrival, posts: items)
        }
        if visible > groups.count { visible = max(page, groups.count) }
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
                FeedPost(id: c.id + "-hero", craftId: c.id, craftName: c.name, location: c.reg.location, avatar: avatar,
                         thumb: DataStore.imageURL(f.file), full: DataStore.imageURL(f.full),
                         caption: cap(f.sol, f.instrument), sol: f.sol, arrival: arrival(f.capturedUtc),
                         lightLine: light, isRemote: false)
            ]
            for (i, r) in (f.recent ?? []).enumerated() {
                list.append(FeedPost(id: "\(c.id)-\(i)", craftId: c.id, craftName: c.name, location: c.reg.location, avatar: avatar,
                                     thumb: DataStore.imageURL(r.file), full: DataStore.imageURL(r.full),
                                     caption: cap(r.sol, r.instrument), sol: r.sol, arrival: arrival(r.capturedUtc),
                                     lightLine: light, isRemote: false))
            }
            byCraft[c.id] = list
            if let sol = f.sol { cursors[c.id] = RoverCursor(id: c.id, nextSol: sol) }
        }
        remerge()
    }

    /// Live-first, in two steps: show what NASA published most recently, then
    /// pull that sol in full. A publication is one rover on one sol and has to
    /// be whole from the start — otherwise "Load older photos" grows the post
    /// already on screen instead of adding an older one.
    func refreshLive(from store: DataStore) async {
        for c in store.craft where cursors[c.id] != nil {
            let images = await RoverImages.fetchLatest(roverId: c.id, limit: 48)
            guard !images.isEmpty else { continue }
            byCraft[c.id] = images.map { post(from: $0, craft: c, store: store) }
            remerge()

            let top = images.reduce(0) { max($0, $1.sol) }
            guard top > 0 else { continue }
            let full = await RoverImages.fetch(roverId: c.id, sol: top, limit: 600)
            if full.images.isEmpty {
                cursors[c.id]?.nextSol = top
            } else {
                byCraft[c.id] = full.images.map { post(from: $0, craft: c, store: store) }
                cursors[c.id]?.nextSol = top - 1
                cursors[c.id]?.pulledLatestSol = true
                remerge()
            }
        }
    }

    /// Walk every rover back one sol and re-merge, so the stream stays in date order.
    func loadOlder(from store: DataStore) async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        for c in store.craft {
            guard var cur = cursors[c.id], !cur.done else { continue }
            // The newest sol is already whole (refreshLive did it), so this
            // normally fetches a strictly older one and appends it as its own
            // publication. The else-branch below is only the degraded path where
            // the live pull never landed and we still hold partial bundled frames.
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
        visible = min(visible + page, groups.count)
    }

    private func post(from img: RoverImage, craft: Craft, store: DataStore) -> FeedPost {
        let owlt = craft.eph.owltSeconds
        let caption = img.sol > 0 ? "Sol \(img.sol) · \(img.instrument)" : img.instrument
        return FeedPost(
            id: img.id.uuidString, craftId: craft.id, craftName: craft.name, location: craft.reg.location,
            avatar: store.avatarURL(for: craft.id), thumb: img.thumb, full: img.full,
            caption: caption, sol: img.sol > 0 ? img.sol : nil,
            arrival: Fmt.date(from: img.capturedUtc)?.addingTimeInterval(owlt),
            lightLine: owlt > 0 ? "Its light took \(Fmt.lightTime(owlt)) to cross the void" : nil,
            isRemote: true)
    }

    func revealMore() {
        if visible < groups.count { visible = min(visible + page, groups.count) }
    }
}

struct FeedView: View {
    @ObservedObject var store: DataStore
    @StateObject private var feed = FeedStore()
    @State private var viewer: URL?

    private var shown: [FeedGroup] { Array(feed.groups.prefix(feed.visible)) }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            ScrollView {
                LazyVStack(spacing: 22) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { idx, g in
                        FeedGroupCard(group: g) { viewer = $0 }
                            .onAppear { if idx >= feed.visible - 2 { feed.revealMore() } }
                    }
                    if feed.visible < feed.groups.count || feed.canLoadOlder { loadButton }
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

    private var loadButton: some View {
        Button {
            if feed.visible < feed.groups.count { feed.revealMore() }
            else { Task { await feed.loadOlder(from: store) } }
        } label: {
            HStack(spacing: 8) {
                if feed.loading { ProgressView().tint(Theme.signal).scaleEffect(0.8) }
                Text(feed.loading ? "Loading…" : (feed.visible < feed.groups.count ? "Load more" : "Load older photos"))
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
