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
// The first paint gives NASA half a second, which is usually enough, so the feed
// opens straight on what was published minutes ago. If NASA is slow or down, the
// last live feed on disk or the bundled snapshot paints instead. Scrolling reveals
// a page at a time and walks the rovers back a sol, so the stream stays in date
// order. A new post that lands once the reader has settled waits behind a "New
// photos" pill: a picture must not swap while it is being looked at.

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
                default: Text("Couldn't load image").font(.sans(15)).foregroundColor(Theme.dim)
                }
            }
            VStack {
                HStack {
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).foregroundColor(Theme.txt)
                            .frame(width: 40, height: 40)
                            .glassPill()
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
    /// What the frame is worth showing. A post opens on its best.
    let score: Int
    /// Raw camera name; with the capture time, the frame's identity.
    let instrument: String
    let sol: Int?              // the rover's own day — the grouping key
    /// When the frame reached Earth, from the feed's `date_received`. Measured,
    /// not capture time plus light-time: a rover buffers frames and downlinks
    /// them through a relay orbiter hours or days after the shutter.
    let arrival: Date?
    /// When the shutter fired. Orders the frames inside a publication.
    let captured: Date?
    /// The light-time value alone ("11m 51s"); the card labels it.
    let lightLine: String?
    let isRemote: Bool

    /// Same picture, whichever source described it: bundle and live differ in URLs.
    var frameKey: String { "\(Int(captured?.timeIntervalSince1970 ?? 0))|\(instrument)" }
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
    /// The picture on screen, so it can be followed when more frames land.
    @State private var shownKey: String?
    @State private var mountedAt = Date()

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

    /// The best-scored frame, newest first on a tie.
    private var openingIndex: Int {
        var best = 0, top = Int.min
        for (i, p) in group.posts.enumerated() where p.score > top { top = p.score; best = i }
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
        // Open on the best-scored frame rather than on whatever the sequence
        // starts with. When more frames land, the picture on screen stays the
        // picture on screen: follow it to its new position. The exception is the
        // first moments after it appears, when the whole sol lands a beat after a
        // partial answer: a frame chosen from a handful must not outlive the
        // sol's real best. The order itself is untouched, so the flipbook still
        // reads as motion.
        .onChange(of: count) { _, _ in
            let fresh = Date().timeIntervalSince(mountedAt) < 1.5
            if !fresh || touched,
               let key = shownKey, let at = group.posts.firstIndex(where: { $0.frameKey == key }) {
                index = at
            } else if !touched {
                index = openingIndex
            }
        }
        .onChange(of: index) { _, _ in shownKey = current?.frameKey }
        .onAppear {
            if !touched { index = openingIndex }
            shownKey = current?.frameKey
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
                else { Circle().fill(Theme.panel3).overlay(Text(String(group.craftName.prefix(1))).font(.sansSemi(15)).foregroundColor(Theme.dim)) }
            }
            .frame(width: 36, height: 36).clipShape(Circle())
            .overlay(Circle().stroke(Theme.rule2, lineWidth: 1))
            VStack(alignment: .leading, spacing: 2) {
                Text(group.craftName).font(.titleSemi(17)).foregroundColor(Theme.txt)
                Text(group.location).font(.sans(13)).foregroundColor(Theme.dim)
            }
            Spacer()
            if let n = group.newest {
                // When it reached Earth: a timestamp, so grey and mono.
                Text(Fmt.ago(n)).font(.mono(12)).foregroundColor(Theme.dim2)
            }
        }
        .padding(.horizontal, 16).padding(.bottom, 12)
    }

    private var stage: some View {
        ZStack {
            Color.black
            if let p = current {
                // The thumbnail sits behind the frame as a stand-in: 8 KB, and the
                // strip has usually fetched it, so the stage shows the picture
                // immediately and not a spinner on black.
                FeedPhoto(post: p)
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
        // The full width of the phone, square: most rover frames are close to it.
        .aspectRatio(1, contentMode: .fit)
        .clipped()
        .contentShape(Rectangle())
        .overlay(alignment: .topTrailing) {
            if count > 1 {
                Text("\(clamp(index) + 1)/\(count)")
                    .font(.monoMed(12)).foregroundColor(Theme.txt)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .glassPill()
                    .padding(10)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if count > 1 {
                Button { touched = true; playing.toggle() } label: {
                    Image(systemName: playing ? "pause.fill" : "play.fill")
                        .font(.system(size: 12, weight: .bold)).foregroundColor(Theme.txt)
                        .frame(width: 34, height: 34)
                        .glassPill()
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
                        .clipShape(RoundedRectangle(cornerRadius: 3))
                        .opacity(k == active ? 1 : 0.4)
                        .overlay(
                            RoundedRectangle(cornerRadius: 3)
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
        .background(Theme.panel)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let p = current {
                Text(p.caption).font(.sansMed(15)).foregroundColor(Theme.txt)
            }
            // As on the web: a micro-label naming the value, the value in amber.
            if let l = group.lightLine {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    MicroLabel("Light-time")
                    Text(l).font(.monoMed(13)).foregroundColor(Theme.delay)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16).padding(.top, 10)
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
                // Sized frames draw over a stand-in, so they stay see-through
                // until loaded and the picture never blinks back to a spinner.
                case .empty: if sharp || large { Color.clear } else { ProgressView().tint(Theme.dim) }
                default: if sharp || large { Color.clear } else { Rectangle().fill(Theme.rule) }
                }
            }
        } else {
            BundleImage(url: src, contentMode: contentMode)
        }
    }
}


// MARK: - Last live feed, kept on disk
//
// The bundled snapshot is frozen at build time: a fortnight after a release it
// seeds the feed with a fortnight-old photos, and the live posts only replace
// them once mars2020 answers, which takes 11 to 16 seconds on its own. Writing
// the last live result down means the second launch onwards opens straight on
// the posts you last saw, and the network refresh lands on top of them.
//
// Caches, not Application Support: this is reconstructible from the network, so
// the system is welcome to reclaim it.

private struct CachedFrame: Codable {
    let thumb: URL, view: URL, full: URL, sourceUrl: URL
    let instrument: String, capturedUtc: String, receivedUtc: String
    let sol: Int, score: Int

    init(_ i: RoverImage) {
        thumb = i.thumb; view = i.view; full = i.full; sourceUrl = i.sourceUrl
        instrument = i.instrument; capturedUtc = i.capturedUtc
        receivedUtc = i.receivedUtc; sol = i.sol; score = i.score
    }
    var image: RoverImage {
        RoverImage(thumb: thumb, view: view, full: full, sourceUrl: sourceUrl,
                   instrument: instrument, capturedUtc: capturedUtc,
                   receivedUtc: receivedUtc, sol: sol, score: score)
    }
}

private struct CachedRover: Codable {
    let frames: [CachedFrame]
    let nextSol: Int?
}

private struct CachedFeed: Codable {
    let savedAt: Date
    let rovers: [String: CachedRover]
}

enum FeedCache {
    private static var url: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
            .first?.appendingPathComponent("feed-live-v2.json") // v2: frames carry a score
    }

    static func save(_ rovers: [String: (images: [RoverImage], nextSol: Int?)]) {
        guard let url else { return }
        let payload = CachedFeed(
            savedAt: Date(),
            rovers: rovers.mapValues { CachedRover(frames: $0.images.map(CachedFrame.init), nextSol: $0.nextSol) },
        )
        guard let data = try? JSONEncoder().encode(payload) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func load() -> [String: (images: [RoverImage], nextSol: Int?)] {
        guard let url, let data = try? Data(contentsOf: url),
              let payload = try? JSONDecoder().decode(CachedFeed.self, from: data)
        else { return [:] }
        return payload.rovers.mapValues { (images: $0.frames.map(\.image), nextSol: $0.nextSol) }
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
    /// The first paint gives NASA a beat, so the reader does not watch a post get
    /// replaced a moment after it appears.
    @Published private(set) var ready = false
    /// A newer publication has landed and is waiting behind the pill.
    @Published private(set) var hasPending = false
    /// The first post is on screen. Set by the view.
    var atTop = true

    private var byCraft: [String: [FeedPost]] = [:]
    private var cursors: [String: RoverCursor] = [:]
    private var seeded = false
    private var openedAt = Date()
    private var pending: [String: (images: [RoverImage], nextSol: Int?)] = [:]
    /// What the disk cache will hold, one rover at a time.
    private var latestLive: [String: (images: [RoverImage], nextSol: Int?)] = [:]
    /// Rovers whose whole sols have landed; a refresh keeps them on screen
    /// until the new whole sols are in, so nothing shrinks while it runs.
    private var wholeLanded = Set<String>()
    private var lightLines: [String: String] = [:]
    let page = 4

    private static let firstPaintWait: UInt64 = 500_000_000
    /// A new post that lands this soon after opening is simply the top of the feed.
    private static let settleSeconds: TimeInterval = 5
    private static let solsPerRover = 3

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
            .filter { $0.score >= 0 } // night noise, flat sky, sun-finding crops
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
            let sorted = items.sorted { ($0.captured ?? .distantPast) > ($1.captured ?? .distantPast) }
            let good = sorted.filter { $0.score >= frameScoreGood }
            let seq = good.count >= 3 ? good : sorted
            return FeedGroup(id: key, craftName: head.craftName, location: head.location,
                             avatar: head.avatar, lightLine: lightLines[head.craftId] ?? head.lightLine,
                             newest: head.arrival, posts: seq)
        }
        if visible > groups.count { visible = max(page, groups.count) }
    }

    /// Instant first paint. Two candidate sources per craft: the snapshot baked
    /// into the app, and whatever the last live load wrote to disk. Neither is
    /// reliably the fresher one — a new build ships a recent bundle, a long-run
    /// install has a recent cache — so each craft takes whichever holds the
    /// later arrival. No clock or build date needed, just the data.
    func seed(from store: DataStore) {
        guard !seeded else { return }
        seeded = true
        let cached = FeedCache.load()
        for c in store.craft {
            guard let f = store.frames[c.id] else { continue }
            let owlt = c.eph.owltSeconds
            let light = owlt > 0 ? Fmt.lightTime(owlt) : nil
            let avatar = store.avatarURL(for: c.id)
            // Measured arrival when the bundle carries one; bundles written
            // before `receivedUtc` existed fall back to capture plus light-time.
            func arrival(_ received: String?, _ captured: String) -> Date? {
                if let r = received, let d = Fmt.date(from: r) { return d }
                return Fmt.date(from: captured)?.addingTimeInterval(owlt)
            }
            func cap(_ sol: Int?, _ instrument: String) -> String {
                sol.map { "Sol \($0) · \(cameraName(instrument))" } ?? cameraName(instrument)
            }
            var list: [FeedPost] = [
                FeedPost(id: c.id + "-hero", craftId: c.id, craftName: c.name, location: c.reg.location, avatar: avatar,
                         thumb: DataStore.imageURL(f.file), view: nil, full: DataStore.imageURL(f.full),
                         caption: cap(f.sol, f.instrument), score: frameScoreGood, instrument: f.instrument, sol: f.sol,
                         arrival: arrival(f.receivedUtc, f.capturedUtc),
                         captured: Fmt.date(from: f.capturedUtc),
                         lightLine: light, isRemote: false)
            ]
            for (i, r) in (f.recent ?? []).enumerated() {
                list.append(FeedPost(id: "\(c.id)-\(i)", craftId: c.id, craftName: c.name, location: c.reg.location, avatar: avatar,
                                     thumb: DataStore.imageURL(r.file), view: nil, full: DataStore.imageURL(r.full),
                                     caption: cap(r.sol, r.instrument), score: r.score ?? frameScoreGood, instrument: r.instrument, sol: r.sol,
                                     arrival: arrival(r.receivedUtc, r.capturedUtc),
                                     captured: Fmt.date(from: r.capturedUtc),
                                     lightLine: light, isRemote: false))
            }
            if let hit = cached[c.id], !hit.images.isEmpty {
                let live = hit.images.map { post(from: $0, craft: c, store: store) }
                let newest = { (ps: [FeedPost]) in ps.compactMap(\.arrival).max() ?? .distantPast }
                if newest(live) >= newest(list) {
                    byCraft[c.id] = live
                    ready = true // the reader's own last feed: nothing to wait for
                    if let next = hit.nextSol {
                        cursors[c.id] = RoverCursor(id: c.id, nextSol: next, pulledLatestSol: true)
                    } else if let sol = f.sol {
                        cursors[c.id] = RoverCursor(id: c.id, nextSol: sol)
                    }
                    continue
                }
            }
            byCraft[c.id] = list
            if let sol = f.sol { cursors[c.id] = RoverCursor(id: c.id, nextSol: sol) }
        }
        remerge()
    }

    /// Each rover loads on its own, in two steps: its newest frames (a fraction of
    /// a second), then its latest sols whole, because a publication has to be
    /// complete before the reader can scroll past it. The caches behind these
    /// calls are actor-isolated, which is what makes firing them together safe.
    ///
    /// `force` bypasses the in-memory caches. Opening the feed and pulling to
    /// refresh both use it: the newest sol is still being added to.
    func refreshLive(from store: DataStore, force: Bool = false) async {
        let ids = store.craft.filter { cursors[$0.id] != nil }.map(\.id)
        guard !ids.isEmpty else { ready = true; return }
        await withTaskGroup(of: Void.self) { group in
            for id in ids {
                group.addTask { await self.loadRover(id, store: store, force: force) }
            }
        }
        ready = true
    }

    /// Opens the feed: gives NASA a beat, then paints whatever is in hand.
    func openFirstPaint() async {
        try? await Task.sleep(nanoseconds: Self.firstPaintWait)
        ready = true
    }

    /// The reader has come back: anything new is simply the top of the feed.
    func markOpened() { openedAt = Date() }

    private func loadRover(_ id: String, store: DataStore, force: Bool) async {
        let latest = await RoverImages.fetchLatest(roverId: id, limit: 100, force: force)
        guard !latest.isEmpty else { return }

        // Every sol in the newest downlink, then back from there, so the stream
        // opens with several posts and not one. Capped, so an unusual batch
        // cannot fan out into many requests.
        var sols = Array(Set(latest.map(\.sol).filter { $0 > 0 }).sorted(by: >).prefix(Self.solsPerRover))
        guard !sols.isEmpty else { return publish(id, images: latest, nextSol: nil, store: store) }
        while sols.count < Self.solsPerRover, let last = sols.last, last > 0 { sols.append(last - 1) }
        let lowest = sols.last ?? 0

        if !wholeLanded.contains(id) { publish(id, images: latest, nextSol: nil, store: store) }

        // Sols come back in whatever order they finish. That is fine: `remerge`
        // buckets by sol and orders each publication by capture time.
        let whole = await withTaskGroup(of: [RoverImage].self) { inner -> [RoverImage] in
            for sol in sols {
                inner.addTask { await RoverImages.fetch(roverId: id, sol: sol, limit: 600, force: force).images }
            }
            var acc: [RoverImage] = []
            for await part in inner { acc += part }
            return acc
        }
        guard !whole.isEmpty else { return }
        wholeLanded.insert(id)
        latestLive[id] = (whole, lowest - 1)
        FeedCache.save(latestLive)
        publish(id, images: whole, nextSol: lowest - 1, store: store)
    }

    /// Lands a rover's frames, or holds them behind the pill when they would
    /// change the top of the stream under a reader who has settled.
    private func publish(_ id: String, images: [RoverImage], nextSol: Int?, store: DataStore) {
        let newest = images.filter { $0.score >= 0 }.compactMap { Fmt.date(from: $0.receivedUtc) }.max() ?? .distantPast
        let top = groups.first?.newest ?? .distantPast
        let settled = Date().timeIntervalSince(openedAt) > Self.settleSeconds
        if ready, groups.first != nil, settled || !atTop, newest > top {
            pending[id] = (images, nextSol)
            hasPending = true
            return
        }
        apply(id, images: images, nextSol: nextSol, store: store)
        remerge()
        ready = true
    }

    private func apply(_ id: String, images: [RoverImage], nextSol: Int?, store: DataStore) {
        guard let craft = store.craft.first(where: { $0.id == id }) else { return }
        // Sols the reader has already scrolled back to stay: a refresh carries
        // only the latest sols, and dropping the rest would pull the feed out
        // from under them.
        let lowest = images.map(\.sol).min() ?? 0
        let older = (cursors[id]?.pulledLatestSol ?? false)
            ? (byCraft[id] ?? []).filter { ($0.sol ?? 0) < lowest } : []
        byCraft[id] = images.map { post(from: $0, craft: craft, store: store) } + older
        if older.isEmpty, let nextSol {
            cursors[id]?.nextSol = nextSol
            cursors[id]?.pulledLatestSol = true
        }
        prefetchOpening(of: 3)
    }

    /// The light-time line follows today's ephemerides as soon as they land.
    func updateLight(_ craft: [Craft]) {
        for c in craft where c.eph.owltSeconds > 0 {
            lightLines[c.id] = Fmt.lightTime(c.eph.owltSeconds)
        }
        remerge()
    }

    /// Show what the pill was holding.
    func showPending(from store: DataStore) {
        for (id, r) in pending { apply(id, images: r.images, nextSol: r.nextSol, store: store) }
        pending = [:]
        hasPending = false
        remerge()
    }

    /// Warm the next posts' opening frames, so scrolling lands on a picture.
    func prefetchOpening(of count: Int, after index: Int = -1) {
        for g in groups.dropFirst(index + 1).prefix(count) {
            let best = g.posts.max { $0.score < $1.score }
            guard let p = best, p.isRemote, let url = p.view else { continue }
            let task = URLSession.shared.dataTask(with: url)
            task.priority = URLSessionTask.lowPriority
            task.resume()
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
        let caption = img.sol > 0 ? "Sol \(img.sol) · \(cameraName(img.instrument))" : cameraName(img.instrument)
        return FeedPost(
            id: img.id.uuidString, craftId: craft.id, craftName: craft.name, location: craft.reg.location,
            avatar: store.avatarURL(for: craft.id), thumb: img.thumb, view: img.view, full: img.full,
            caption: caption, score: img.score, instrument: img.instrument, sol: img.sol > 0 ? img.sol : nil,
            arrival: Fmt.date(from: img.receivedUtc)
                ?? Fmt.date(from: img.capturedUtc)?.addingTimeInterval(owlt),
            captured: Fmt.date(from: img.capturedUtc),
            lightLine: owlt > 0 ? Fmt.lightTime(owlt) : nil,
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
    /// The feed stays mounted behind the other tabs, so coming back returns to
    /// the same place in the stream. This says whether it is the one on screen.
    var isActive = true
    /// Bumped by tapping the Photos tab while already on it: back to the top.
    var scrollToTop = 0
    @ObservedObject private var notifications = NotificationManager.shared
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var feed = FeedStore()
    @State private var viewer: URL?

    private var shown: [FeedGroup] { feed.ready ? Array(feed.groups.prefix(feed.visible)) : [] }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 22) {
                        if shown.isEmpty {
                            // Holds the place of the first post, the same size,
                            // so nothing jumps when it lands.
                            Color.black.aspectRatio(1, contentMode: .fit)
                                .overlay(ProgressView().tint(Theme.dim))
                                .padding(.top, 56)
                                .accessibilityLabel("Loading the latest photos")
                        }
                        ForEach(Array(shown.enumerated()), id: \.element.id) { idx, g in
                            FeedGroupCard(group: g) { viewer = $0 }
                                .id(g.id)
                                .onAppear {
                                    if idx == 0 { feed.atTop = true }
                                    feed.prefetchOpening(of: 2, after: idx)
                                    // Looked at is looked at: never announce this
                                    // publication later as if it were news.
                                    notifications.markPublicationsSeen([g.id])
                                    // Infinite scroll: reveal what's loaded, then
                                    // reach further back. No button.
                                    guard idx >= feed.visible - 2 else { return }
                                    if feed.visible < feed.groups.count { feed.revealMore() }
                                    else { Task { await feed.loadOlder(from: store) } }
                                }
                                .onDisappear { if idx == 0 { feed.atTop = false } }
                        }
                        if feed.loading {
                            HStack(spacing: 8) {
                                ProgressView().tint(Theme.dim).scaleEffect(0.8)
                                Text("Reaching further back…").font(.sans(13)).foregroundColor(Theme.dim)
                            }
                            .padding(.vertical, 18)
                        }
                        archiveSection
                    }
                    .padding(.bottom, 118)
                }
                .refreshable { await feed.refreshLive(from: store, force: true) }
                // The target usually arrives before the sol it points at, so try
                // again on every batch until the card exists.
                .onChange(of: feed.groups.count) { _, _ in jump(proxy) }
                .onChange(of: notifications.pendingTarget) { _, _ in jump(proxy) }
                .onChange(of: scrollToTop) { _, _ in toTop(proxy) }
                .overlay(alignment: .top) {
                    if feed.hasPending {
                        Button {
                            feed.showPending(from: store)
                            toTop(proxy)
                        } label: {
                            // Primary button: white on black text, pill.
                            Label("New photos", systemImage: "arrow.up")
                                .font(.sansSemi(15)).foregroundColor(Theme.void)
                                .padding(.horizontal, 16).padding(.vertical, 9)
                                .background(Capsule().fill(Theme.txt))
                                .shadow(color: .black.opacity(0.5), radius: 20, y: 12)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 8)
                        .transition(.opacity)
                    }
                }
            }
        }
        // The photos run under the status bar; without this the clock prints
        // straight across them.
        .overlay {
            GeometryReader { geo in
                Theme.void.frame(height: geo.safeAreaInsets.top).ignoresSafeArea(edges: .top)
            }
            .allowsHitTesting(false)
        }
        // The value comes from the publisher: @Published fires before the
        // property changes, so reading store.craft here would see the old one.
        .onReceive(store.$craft) { feed.updateLight($0) }
        // Forced, or the five-minute cache would make a re-open a no-op.
        .task {
            feed.seed(from: store)
            async let paint: Void = feed.openFirstPaint()
            await feed.refreshLive(from: store, force: true)
            await paint
        }
        // The feed reloads every time it is opened, from another tab or from the
        // background.
        .onChange(of: isActive) { _, active in
            guard active else { return }
            Task { await feed.refreshLive(from: store, force: true) }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, isActive else { return }
            feed.markOpened()
            Task { await feed.refreshLive(from: store, force: true) }
        }
        .fullScreenCover(item: $viewer) { url in PhotoViewer(url: url) { viewer = nil } }
    }

    private func toTop(_ proxy: ScrollViewProxy) {
        guard let first = shown.first?.id else { return }
        withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(first, anchor: .top) }
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
                Text("Mission archive").font(.titleSemi(20)).titleTracking(20).foregroundColor(Theme.txt)
                    .padding(.horizontal, 16)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(archiveCraft, id: \.id) { c in
                            if let a = store.archive[c.id] {
                                Button { viewer = DataStore.imageURL(a.full) } label: {
                                    VStack(alignment: .leading, spacing: 6) {
                                        BundleImage(url: DataStore.imageURL(a.file), contentMode: .fill)
                                            .frame(width: 150, height: 110).clipped()
                                            .clipShape(RoundedRectangle(cornerRadius: Theme.rS, style: .continuous))
                                        Text(c.name).font(.titleSemi(15)).foregroundColor(Theme.txt).lineLimit(1)
                                        Text(a.title).font(.sans(12)).foregroundColor(Theme.dim)
                                            .lineLimit(1).frame(width: 150, alignment: .leading)
                                    }
                                }.buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.top, 26)
            .overlay(Rectangle().fill(Theme.rule).frame(height: 1).padding(.top, 8), alignment: .top)
        }
    }
}
