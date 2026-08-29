import SwiftUI

// MARK: - Gallery

// The wall of arriving light: one block per craft, each block's photos ordered
// by when their light actually reached Earth (capture + light-travel delay),
// newest arrival first; blocks ordered by their freshest arrival, archive-only
// craft last. The age is the point — none of it is happening now.
// A photo on the wall: bundled ones resolve to a local file (BundleImage);
// live ones are remote mars.nasa.gov URLs (AsyncImage).
struct GalleryPhoto: Identifiable {
    let id: String
    let thumb: URL?
    let full: URL?
    let caption: String
    let arrival: Date?   // when its light reached Earth; nil for archive stills
    let isArchive: Bool
    let isRemote: Bool
}

struct CraftBlock: Identifiable {
    let id: String
    let name: String
    let location: String
    let avatar: URL?
    let lightLine: String?
    let isLive: Bool          // a rover we can page back through, sol by sol
    let latestSol: Int?
    let owlt: Double
    let newestArrival: Date
    let initial: [GalleryPhoto]
}

struct GalleryView: View {
    @ObservedObject var store: DataStore
    @State private var viewer: URL?

    private var blocks: [CraftBlock] {
        var out: [CraftBlock] = []
        for c in store.craft {
            let owlt = c.eph.owltSeconds
            let light = owlt > 0 ? "Its light took \(Fmt.lightTime(owlt)) to cross the void" : nil
            let avatar = store.avatarURL(for: c.id)
            func solCap(_ sol: Int?, _ instrument: String) -> String {
                sol.map { "Sol \($0) · \(instrument)" } ?? instrument
            }
            func arrival(_ iso: String) -> Date? { Fmt.date(from: iso)?.addingTimeInterval(owlt) }

            if let f = store.frames[c.id] {
                var photos: [GalleryPhoto] = [
                    GalleryPhoto(id: c.id + "-hero", thumb: DataStore.imageURL(f.file), full: DataStore.imageURL(f.full),
                                 caption: solCap(f.sol, f.instrument), arrival: arrival(f.capturedUtc), isArchive: false, isRemote: false)
                ]
                for (i, r) in (f.recent ?? []).enumerated() {
                    photos.append(GalleryPhoto(id: "\(c.id)-\(i)", thumb: DataStore.imageURL(r.file), full: DataStore.imageURL(r.full),
                                               caption: solCap(r.sol, r.instrument), arrival: arrival(r.capturedUtc), isArchive: false, isRemote: false))
                }
                photos.sort { ($0.arrival ?? .distantPast) > ($1.arrival ?? .distantPast) }
                out.append(CraftBlock(id: c.id, name: c.name, location: c.reg.location, avatar: avatar, lightLine: light,
                                      isLive: f.sol != nil, latestSol: f.sol, owlt: owlt,
                                      newestArrival: photos.first?.arrival ?? .distantPast, initial: photos))
            } else if let a = store.archive[c.id] {
                out.append(CraftBlock(id: c.id, name: c.name, location: c.reg.location, avatar: avatar, lightLine: light,
                                      isLive: false, latestSol: nil, owlt: owlt, newestArrival: .distantPast,
                                      initial: [GalleryPhoto(id: c.id + "-arch", thumb: DataStore.imageURL(a.file), full: DataStore.imageURL(a.full),
                                                             caption: a.title, arrival: nil, isArchive: true, isRemote: false)]))
            }
        }
        return out.sorted { $0.newestArrival > $1.newestArrival }
    }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(blocks) { block in
                        RoverBlockView(block: block) { viewer = $0 }
                    }
                }
                .padding(.bottom, 100)
            }
        }
        .fullScreenCover(item: $viewer) { url in PhotoViewer(url: url) { viewer = nil } }
    }
}

// One craft's section: a vertical feed of posts (one card per photo), newest
// arrival first. Cards reveal a page at a time — on scroll (the last card's
// onAppear) or via the button — so nothing renders hundreds at once; "Load
// older photos" pulls the next sol from the archive only when you reach the end.
struct RoverBlockView: View {
    let block: CraftBlock
    let onOpen: (URL?) -> Void

    @State private var live: [GalleryPhoto]?
    @State private var visible = 8
    @State private var nextSol = 0
    @State private var fetchedLatest = false
    @State private var loading = false
    @State private var done = false

    private let page = 8
    private var buffer: [GalleryPhoto] { live ?? block.initial }
    private var shown: [GalleryPhoto] { Array(buffer.prefix(visible)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if let l = block.lightLine {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.up.forward").font(.system(size: 9, weight: .bold)).foregroundColor(Theme.delay)
                    Text(l).font(.mono(11)).foregroundColor(Theme.delay)
                }
            }
            LazyVStack(spacing: 14) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { idx, p in
                    card(p).onAppear {
                        if idx >= visible - 2 && visible < buffer.count { visible = min(visible + page, buffer.count) }
                    }
                }
            }
            if visible < buffer.count || (block.isLive && !done) {
                Button {
                    if visible < buffer.count { visible = min(visible + page, buffer.count) }
                    else { Task { await loadOlder() } }
                } label: {
                    HStack(spacing: 8) {
                        if loading { ProgressView().tint(Theme.signal).scaleEffect(0.8) }
                        Text(loading ? "Loading…" : (visible < buffer.count ? "Load more" : "Load older photos"))
                            .font(.mono(12)).foregroundColor(Theme.signal)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 11)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.rule2, lineWidth: 1))
                }
                .buttonStyle(.plain).disabled(loading)
            }
        }
        .padding(.horizontal, 14).padding(.top, 22).padding(.bottom, 8)
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .top)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Group {
                if block.avatar != nil { BundleImage(url: block.avatar, contentMode: .fill) }
                else { Circle().fill(Theme.rule2).overlay(Text(String(block.name.prefix(1))).font(.title(16)).foregroundColor(Theme.dim)) }
            }
            .frame(width: 40, height: 40).clipShape(Circle()).overlay(Circle().stroke(Theme.rule2, lineWidth: 1))
            VStack(alignment: .leading, spacing: 2) {
                Text(block.name).font(.title(20)).foregroundColor(Theme.txt)
                Text(block.location.uppercased()).font(.mono(10)).tracking(1).foregroundColor(Theme.dim)
            }
            Spacer()
        }
    }

    private func card(_ p: GalleryPhoto) -> some View {
        VStack(spacing: 0) {
            Button { onOpen(p.full) } label: {
                photoImage(p).frame(maxWidth: .infinity).background(Color.black)
            }.buttonStyle(.plain)
            HStack {
                Text(p.caption).font(.mono(11)).foregroundColor(Theme.txt).lineLimit(1)
                Spacer()
                Text(p.isArchive ? "mission archive" : "arrived \(Fmt.ago(p.arrival ?? Date()))")
                    .font(.mono(11)).foregroundColor(Theme.delay)
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.rule2, lineWidth: 1))
    }

    @ViewBuilder private func photoImage(_ p: GalleryPhoto) -> some View {
        if p.isRemote {
            AsyncImage(url: p.thumb) { phase in
                switch phase {
                case .success(let img): img.resizable().aspectRatio(contentMode: .fit)
                case .empty: Rectangle().fill(Theme.panel).frame(height: 220)
                default: Rectangle().fill(Theme.rule).frame(height: 220)
                }
            }
        } else {
            BundleImage(url: p.thumb, contentMode: .fit)
        }
    }

    private func loadOlder() async {
        guard !loading, !done, let latest = block.latestSol else { return }
        loading = true
        var sol = fetchedLatest ? nextSol : latest
        var added: [RoverImage] = []
        var tries = 0
        while tries < 8 && sol >= 0 {
            let d = await RoverImages.fetch(roverId: block.id, sol: sol, limit: 600)
            if !d.images.isEmpty { added = d.images; break }
            sol -= 1; tries += 1
        }
        let owlt = block.owlt
        let mapped: [GalleryPhoto] = added.map { img in
            let cap = img.sol > 0 ? "Sol \(img.sol) · \(img.instrument)" : img.instrument
            return GalleryPhoto(id: img.id.uuidString, thumb: img.thumb, full: img.full, caption: cap,
                                arrival: Fmt.date(from: img.capturedUtc)?.addingTimeInterval(owlt), isArchive: false, isRemote: true)
        }
        // The first pull swaps the bundled recent for the complete latest sol;
        // the rest append the previous sol.
        var merged = fetchedLatest ? ((live ?? []) + mapped) : mapped
        merged.sort { ($0.arrival ?? .distantPast) > ($1.arrival ?? .distantPast) }
        live = merged
        fetchedLatest = true
        nextSol = sol - 1
        if sol - 1 < 0 { done = true }
        visible = min(visible + page, merged.count)
        loading = false
    }
}

// Full-screen photo viewer that works for both local (bundled) and remote
// (live) URLs, unlike the ImageStore-backed Lightbox.
private struct PhotoViewer: View {
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

// MARK: - Search / jump-to

private struct SearchRow: Identifiable {
    let id: String
    let sel: Selection
    let name: String
    let sub: String
}

struct SearchView: View {
    @ObservedObject var store: DataStore
    let onSelect: (Selection) -> Void
    let onClose: () -> Void
    @State private var query = ""
    @FocusState private var focused: Bool

    private var rows: [SearchRow] {
        var out: [SearchRow] = []
        out.append(SearchRow(id: "b:sun", sel: .body("sun"), name: "The Sun", sub: "Star"))
        for p in store.planets where p.id != "sun" {
            let kind = store.bodies[p.id]?.kind ?? "Body"
            out.append(SearchRow(id: "b:" + p.id, sel: .body(p.id), name: p.name, sub: kind))
        }
        for c in store.craft {
            out.append(SearchRow(id: "c:" + c.id, sel: .craft(c.id),
                                 name: c.name, sub: c.reg.agency + " · " + c.reg.location))
        }
        guard !query.isEmpty else { return out }
        let q = query.lowercased()
        return out.filter { $0.name.lowercased().contains(q) || $0.sub.lowercased().contains(q) }
    }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundColor(Theme.dim)
                    TextField("", text: $query, prompt: Text("Jump to a craft or world").foregroundColor(Theme.dim2))
                        .font(.mono(15)).foregroundColor(Theme.txt)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focused)
                    Button(action: onClose) {
                        Text("Close").font(.mono(12)).foregroundColor(Theme.dim)
                    }
                }
                .padding(16)
                .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .bottom)

                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(rows) { row in
                            Button { onSelect(row.sel) } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(row.name).font(.monoMed(15)).foregroundColor(Theme.txt)
                                        Text(row.sub.uppercased()).font(.mono(9)).tracking(1)
                                            .foregroundColor(Theme.dim)
                                    }
                                    Spacer()
                                    Image(systemName: "arrow.up.right").font(.system(size: 11))
                                        .foregroundColor(Theme.dim2)
                                }
                                .padding(.horizontal, 16).padding(.vertical, 12)
                            }.buttonStyle(.plain)
                            Rectangle().fill(Theme.rule).frame(height: 1)
                        }
                    }
                }
            }
        }
        .onAppear { focused = true }
    }
}
