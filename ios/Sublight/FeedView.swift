import SwiftUI

// The feed — one chronological stream for the whole fleet, newest arrival first,
// the way a social timeline reads. Each post is a photo: the craft is the
// author, its location the place, the arrival the posted time, and the
// light-travel delay the honest twist underneath.
//
// "Arrival" is the feed's `date_received`, the measured moment the frame
// reached Earth. It is deliberately not capture time plus light-time, which
// would put a batch downlinked 90 minutes ago 28 hours down the stream.
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
    /// Smallest size: the scrub strip.
    let thumb: URL?
    /// Mid size for the stage. Bundled frames leave this nil — their `file` is
    /// already a local render that serves the stage fine.
    let view: URL?
    let full: URL?
    let caption: String        // "Sol 1969 · MCZ_RIGHT"
    /// Raw camera name, for ranking which frame a post opens on.
    let instrument: String
    let sol: Int?              // the rover's own day — the grouping key
    /// When the frame reached Earth, from the feed's `date_received`. Measured,
    /// not capture time plus light-time: a rover buffers frames and downlinks
    /// them through a relay orbiter hours or days after the shutter.
    let arrival: Date?
    /// When the shutter fired. Orders the frames inside a publication.
    let captured: Date?
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
    /// Set as soon as the reader scrubs or plays, so we stop moving the frame.
    @State private var touched = false
    /// The frame whose sharp size has been asked for. Nil while the sequence is
    /// running or the reader is scrubbing.
    @State private var sharpIndex: Int?

    // A complete sol can run to a couple of hundred frames. Past this the strip
    // is sampled: at 214 thumbnails each is under 2pt wide, so it tells you
    // nothing and costs a request per frame. Scrubbing still covers every frame.
    private let stripMax = 40

    private var count: Int { group.posts.count }

    /// Evenly spaced sample of the sequence, always including first and last.
    private var stripFrames: [(index: Int, post: FeedPost)] {
        guard count > stripMax else { return group.posts.enumerated().map { ($0.offset, $0.element) } }
        return (0..<stripMax).map { k in
            let i = Int((Double(k) * Double(count - 1) / Double(stripMax - 1)).rounded())
            return (i, group.posts[i])
        }
    }
    private func clamp(_ i: Int) -> Int { min(max(i, 0), max(count - 1, 0)) }

    /// First frame from the best-ranked camera present in the batch.
    private var openingIndex: Int {
        var best = 0, bestRank = 99
        for (i, p) in group.posts.enumerated() {
            let r = cameraRank(p.instrument)
            if r < bestRank { bestRank = r; best = i; if r == 0 { break } }
        }
        return best
    }
    private var current: FeedPost? { group.posts.indices.contains(clamp(index)) ? group.posts[clamp(index)] : nil }

    var body: some View {
        VStack(spacing: 0) {
            header
            stage
            if count > 1 { strip }
            footer
        }
        // Open on the best camera in the batch rather than on whatever the
        // sequence starts with, often a micro-shot or a hazcam of the wheels.
        // Keyed on the count, not run once: the card first renders on the
        // bundled seed and the live batch replaces it a moment later, so an
        // index picked at mount would point into an array that no longer
        // exists. The order itself is untouched, so the flipbook still reads
        // as motion; only the frame you land on changes.
        .onChange(of: count) { _, _ in
            guard !touched else { return }
            index = openingIndex
        }
        .onAppear { if !touched { index = openingIndex } }
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
                Text(group.craftName).font(.title(17)).foregroundColor(Theme.txt)
                Text(group.location).font(.title(12)).foregroundColor(Theme.dim)
            }
            Spacer()
            if let n = group.newest {
                Text(Fmt.ago(n)).font(.mono(11.5)).foregroundColor(Theme.dim2)
            }
        }
        .padding(.horizontal, 14).padding(.bottom, 10)
    }

    private var stage: some View {
        ZStack {
            Color.black
            if let p = current {
                FeedPhoto(post: p, large: true)
                // Motion doesn't need detail; a still does. The mid size is
                // 500pt (MSL) or 800pt (M20) on a stage that is 3x that on a
                // phone screen, so a frame the reader has stopped on is loaded
                // sharp and drawn over the top.
                if sharpIndex == clamp(index) {
                    FeedPhoto(post: p, large: true, sharp: true)
                }
            }
        }
        // Resets on every step, so nothing heavy is fetched while playing or
        // scrubbing; it only fires once the frame holds still.
        .task(id: "\(clamp(index))-\(playing)") {
            sharpIndex = nil
            guard !playing else { return }
            try? await Task.sleep(nanoseconds: 180_000_000)
            guard !Task.isCancelled else { return }
            sharpIndex = clamp(index)
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
                Button { touched = true; playing.toggle() } label: {
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
                    if dragAnchor == nil { dragAnchor = clamp(index); playing = false; touched = true }
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
                // Highlight whichever sampled thumb sits closest to the frame on screen.
                let frames = stripFrames
                let active = frames.enumerated().min {
                    abs($0.element.index - clamp(index)) < abs($1.element.index - clamp(index))
                }?.offset ?? 0
                ForEach(Array(frames.enumerated()), id: \.element.post.id) { k, entry in
                    // The empty box takes an equal share of the width; the photo
                    // fills it and is cropped. Sizing the image itself let a wide
                    // panorama dictate the layout and leave the strip ragged.
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .overlay(FeedPhoto(post: entry.post, contentMode: .fill))
                        .clipShape(RoundedRectangle(cornerRadius: 2))
                        .opacity(k == active ? 1 : 0.4)
                        .overlay(
                            RoundedRectangle(cornerRadius: 2)
                                .stroke(k == active ? Theme.signal : .clear, lineWidth: 1)
                        )
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        playing = false
                        touched = true
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
                Text(p.caption).font(.title(12.5)).foregroundColor(Theme.txt)
            }
            if let l = group.lightLine {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.up.forward").font(.system(size: 9, weight: .bold)).foregroundColor(Theme.delay)
                    Text(l).font(.mono(12)).foregroundColor(Theme.delay)
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
    /// The stage wants the mid size; the strip wants the smallest.
    var large = false
    /// The sharp size, for a frame the reader has stopped on. It draws over the
    /// mid size and stays transparent until it has actually loaded, so the
    /// picture never blinks back to a spinner while it upgrades.
    var sharp = false
    private var src: URL? {
        if sharp { return post.full ?? post.view ?? post.thumb }
        return large ? (post.view ?? post.thumb) : post.thumb
    }
    var body: some View {
        if post.isRemote {
            AsyncImage(url: src) { phase in
                switch phase {
                case .success(let img): img.resizable().aspectRatio(contentMode: contentMode)
                case .empty: if sharp { Color.clear } else { ProgressView().tint(Theme.dim) }
                default: if sharp { Color.clear } else { Rectangle().fill(Theme.rule) }
                }
            }
        } else {
            BundleImage(url: src, contentMode: contentMode)
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
            // Order *within* a publication stays capture order, newest first.
            // These frames are usually one sequence, and the flipbook only reads
            // as motion if they run as the camera shot them. A whole downlink
            // shares one arrival, so ordering the post by arrival scrambles it.
            let seq = items.sorted { ($0.captured ?? .distantPast) > ($1.captured ?? .distantPast) }
            return FeedGroup(id: key, craftName: head.craftName, location: head.location,
                             avatar: head.avatar, lightLine: head.lightLine,
                             newest: head.arrival, posts: seq)
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
            // Measured arrival when the bundle carries one; bundles written
            // before `receivedUtc` existed fall back to capture plus light-time.
            func arrival(_ received: String?, _ captured: String) -> Date? {
                if let r = received, let d = Fmt.date(from: r) { return d }
                return Fmt.date(from: captured)?.addingTimeInterval(owlt)
            }
            func cap(_ sol: Int?, _ instrument: String) -> String {
                sol.map { "Sol \($0) · \(instrument)" } ?? instrument
            }
            var list: [FeedPost] = [
                FeedPost(id: c.id + "-hero", craftId: c.id, craftName: c.name, location: c.reg.location, avatar: avatar,
                         thumb: DataStore.imageURL(f.file), view: nil, full: DataStore.imageURL(f.full),
                         caption: cap(f.sol, f.instrument), instrument: f.instrument, sol: f.sol,
                         arrival: arrival(f.receivedUtc, f.capturedUtc),
                         captured: Fmt.date(from: f.capturedUtc),
                         lightLine: light, isRemote: false)
            ]
            for (i, r) in (f.recent ?? []).enumerated() {
                list.append(FeedPost(id: "\(c.id)-\(i)", craftId: c.id, craftName: c.name, location: c.reg.location, avatar: avatar,
                                     thumb: DataStore.imageURL(r.file), view: nil, full: DataStore.imageURL(r.full),
                                     caption: cap(r.sol, r.instrument), instrument: r.instrument, sol: r.sol,
                                     arrival: arrival(r.receivedUtc, r.capturedUtc),
                                     captured: Fmt.date(from: r.capturedUtc),
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
    ///
    /// `force` bypasses the network caches. Opening the gallery and pulling to
    /// refresh both use it: the newest sol is still being added to while you
    /// look at it, so a cached answer would make a re-open a no-op.
    /// One publication of state for the whole live load, not one per rover per
    /// step. Assigning as each rover landed re-sorted the entire stream every
    /// time: two rovers, two steps each, and the reader watched the top post
    /// jump between craft and ages for several seconds. The seed paints
    /// instantly; this replaces it once, complete.
    func refreshLive(from store: DataStore, force: Bool = false) async {
        let rovers = store.craft.filter { cursors[$0.id] != nil }
        guard !rovers.isEmpty else { return }

        var fetched: [(id: String, posts: [FeedPost], nextSol: Int?)] = []
        for c in rovers {
            let images = await RoverImages.fetchLatest(roverId: c.id, limit: 48, force: force)
            guard !images.isEmpty else { continue }

            // Every sol in the newest downlink, not just the highest one. A
            // rover can send an older sol home after a newer one, and the
            // stream is ordered by arrival, so that older sol belongs at the
            // top. Capped, so an odd batch can't fan out into many requests.
            let sols = Array(Set(images.map(\.sol).filter { $0 > 0 }).sorted(by: >).prefix(3))
            guard let lowest = sols.last else {
                fetched.append((c.id, images.map { post(from: $0, craft: c, store: store) }, nil))
                continue
            }
            var whole: [RoverImage] = []
            for sol in sols {
                whole += await RoverImages.fetch(roverId: c.id, sol: sol, limit: 600, force: force).images
            }
            if whole.isEmpty {
                fetched.append((c.id, images.map { post(from: $0, craft: c, store: store) }, nil))
            } else {
                fetched.append((c.id, whole.map { post(from: $0, craft: c, store: store) }, lowest - 1))
            }
        }

        guard !fetched.isEmpty else { return }
        for f in fetched {
            byCraft[f.id] = f.posts
            if let next = f.nextSol {
                cursors[f.id]?.nextSol = next
                cursors[f.id]?.pulledLatestSol = true
            }
        }
        remerge()
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
            avatar: store.avatarURL(for: craft.id), thumb: img.thumb, view: img.view, full: img.full,
            caption: caption, instrument: img.instrument, sol: img.sol > 0 ? img.sol : nil,
            arrival: Fmt.date(from: img.receivedUtc)
                ?? Fmt.date(from: img.capturedUtc)?.addingTimeInterval(owlt),
            captured: Fmt.date(from: img.capturedUtc),
            lightLine: owlt > 0 ? "Its light took \(Fmt.lightTime(owlt)) to cross the void" : nil,
            isRemote: true)
    }

    func revealMore() {
        if visible < groups.count { visible = min(visible + page, groups.count) }
    }

    /// Make a publication reachable before scrolling to it. Returns false when
    /// the feed hasn't loaded that far back yet, so the caller can wait for the
    /// next batch rather than clearing the target.
    func focus(groupId: String) -> Bool {
        guard let idx = groups.firstIndex(where: { $0.id == groupId }) else { return false }
        if idx >= visible { visible = min(groups.count, idx + 2) }
        return true
    }
}

struct FeedView: View {
    @ObservedObject var store: DataStore
    @ObservedObject private var notifications = NotificationManager.shared
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var feed = FeedStore()
    @State private var viewer: URL?

    private var shown: [FeedGroup] { Array(feed.groups.prefix(feed.visible)) }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 22) {
                        ForEach(Array(shown.enumerated()), id: \.element.id) { idx, g in
                            FeedGroupCard(group: g) { viewer = $0 }
                                .id(g.id)
                                .onAppear {
                                    // Looked at is looked at: never announce this
                                    // publication later as if it were news.
                                    notifications.markPublicationsSeen([g.id])
                                    // Infinite scroll: reveal what's loaded, then
                                    // reach further back. No button.
                                    guard idx >= feed.visible - 2 else { return }
                                    if feed.visible < feed.groups.count { feed.revealMore() }
                                    else { Task { await feed.loadOlder(from: store) } }
                                }
                        }
                        if feed.loading {
                            HStack(spacing: 8) {
                                ProgressView().tint(Theme.dim).scaleEffect(0.8)
                                Text("Reaching further back…").font(.mono(12)).foregroundColor(Theme.dim)
                            }
                            .padding(.vertical, 18)
                        }
                        archiveSection
                    }
                    .padding(.bottom, 100)
                }
                .refreshable { await feed.refreshLive(from: store, force: true) }
                // The target usually arrives before the sol it points at, so try
                // again on every batch until the card exists.
                .onChange(of: feed.groups.count) { _, _ in jump(proxy) }
                .onChange(of: notifications.pendingTarget) { _, _ in jump(proxy) }
            }
        }
        // The view is torn down when you leave the tab, so this runs on every
        // open. Forced, or the five-minute cache would make a re-open a no-op.
        .task {
            feed.seed(from: store)
            await feed.refreshLive(from: store, force: true)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await feed.refreshLive(from: store, force: true) }
        }
        .fullScreenCover(item: $viewer) { url in PhotoViewer(url: url) { viewer = nil } }
    }

    /// Scroll to the publication a tapped notification named, once it's loaded.
    private func jump(_ proxy: ScrollViewProxy) {
        guard let target = notifications.pendingTarget else { return }
        guard feed.focus(groupId: target.groupId) else { return }
        notifications.pendingTarget = nil
        withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(target.groupId, anchor: .top) }
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
                Text("MISSION ARCHIVE").font(.title(12)).tracking(1.5).foregroundColor(Theme.dim)
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
                                        Text(c.name).font(.title(18)).foregroundColor(Theme.txt).lineLimit(1)
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
