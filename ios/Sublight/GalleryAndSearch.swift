import SwiftUI

// MARK: - Gallery

// The wall of arriving light: one block per craft, each block's photos ordered
// by when their light actually reached Earth (capture + light-travel delay),
// newest arrival first; blocks ordered by their freshest arrival, archive-only
// craft last. The age is the point — none of it is happening now.
struct GalleryView: View {
    @ObservedObject var store: DataStore
    @State private var lightbox: URL?
    @State private var storyRover: StoryID?

    private struct StoryID: Identifiable { let id: String }
    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 8)]

    // Craft with a live per-sol firehose (the Mars rovers): a captured sol number
    // is the tell. Each opens a full-screen "story" of all its raw frames.
    private struct StoryCraft: Identifiable { let id: String; let name: String; let location: String; let sol: Int; let owlt: Double }
    private var storyCraft: [StoryCraft] {
        store.craft.compactMap { c in
            guard let f = store.frames[c.id], let sol = f.sol else { return nil }
            return StoryCraft(id: c.id, name: c.name, location: c.reg.location, sol: sol, owlt: c.eph.owltSeconds)
        }
    }

    private struct BlockPhoto: Identifiable {
        let id: String
        let thumb: URL?
        let full: URL?
        let caption: String
        let arrival: Date?   // nil for archive stills (no capture time)
        let isArchive: Bool
    }
    private struct CraftBlock: Identifiable {
        let id: String
        let name: String
        let location: String
        let avatar: URL?
        let lightLine: String?
        let newestArrival: Date
        let photos: [BlockPhoto]
    }

    private var blocks: [CraftBlock] {
        var out: [CraftBlock] = []
        for c in store.craft {
            let owlt = c.eph.owltSeconds
            let light = owlt > 0 ? "Its light took \(Fmt.lightTime(owlt)) to cross the void" : nil
            let avatar = store.avatarURL(for: c.id)
            func solCap(_ sol: Int?, _ instrument: String) -> String {
                sol.map { "Sol \($0) · \(instrument)" } ?? instrument
            }
            // Arrival = when the light reached Earth = capture + light-travel time.
            func arrival(_ iso: String) -> Date? { Fmt.date(from: iso)?.addingTimeInterval(owlt) }

            if let f = store.frames[c.id] {
                var photos: [BlockPhoto] = [
                    BlockPhoto(id: c.id + "-hero", thumb: DataStore.imageURL(f.file), full: DataStore.imageURL(f.full),
                               caption: solCap(f.sol, f.instrument), arrival: arrival(f.capturedUtc), isArchive: false)
                ]
                for (i, r) in (f.recent ?? []).enumerated() {
                    photos.append(BlockPhoto(id: "\(c.id)-\(i)", thumb: DataStore.imageURL(r.file), full: DataStore.imageURL(r.full),
                                             caption: solCap(r.sol, r.instrument), arrival: arrival(r.capturedUtc), isArchive: false))
                }
                photos.sort { ($0.arrival ?? .distantPast) > ($1.arrival ?? .distantPast) }
                out.append(CraftBlock(id: c.id, name: c.name, location: c.reg.location, avatar: avatar,
                                      lightLine: light, newestArrival: photos.first?.arrival ?? .distantPast, photos: photos))
            } else if let a = store.archive[c.id] {
                out.append(CraftBlock(id: c.id, name: c.name, location: c.reg.location, avatar: avatar,
                                      lightLine: light, newestArrival: .distantPast,
                                      photos: [BlockPhoto(id: c.id + "-arch", thumb: DataStore.imageURL(a.file),
                                                          full: DataStore.imageURL(a.full), caption: a.title, arrival: nil, isArchive: true)]))
            }
        }
        return out.sorted { $0.newestArrival > $1.newestArrival }
    }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if !storyCraft.isEmpty { storiesRail }
                    ForEach(blocks) { block in blockView(block) }
                }
                .padding(.bottom, 100)
            }
        }
        .fullScreenCover(item: $lightbox) { url in Lightbox(url: url) { lightbox = nil } }
        .fullScreenCover(item: $storyRover) { s in storyView(for: s.id) }
    }

    private var storiesRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(storyCraft) { s in
                    Button { storyRover = StoryID(id: s.id) } label: {
                        VStack(spacing: 7) {
                            ZStack {
                                Circle().fill(LinearGradient(colors: [Theme.signal, Theme.delay],
                                                             startPoint: .topLeading, endPoint: .bottomTrailing))
                                    .frame(width: 64, height: 64)
                                storyAvatar(s.id, s.name)
                                    .frame(width: 58, height: 58).clipShape(Circle())
                                    .overlay(Circle().stroke(Theme.void, lineWidth: 2.5))
                            }
                            Text(s.name).font(.mono(11)).foregroundColor(Theme.dim)
                                .lineLimit(1).frame(maxWidth: 72)
                        }
                    }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 14)
        }
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .bottom)
    }

    private func storyAvatar(_ id: String, _ name: String) -> some View {
        Group {
            if let url = store.avatarURL(for: id) {
                BundleImage(url: url, contentMode: .fill)
            } else {
                Circle().fill(Theme.rule2).overlay(
                    Text(String(name.prefix(1))).font(.title(18)).foregroundColor(Theme.dim))
            }
        }
    }

    @ViewBuilder private func storyView(for id: String) -> some View {
        if let s = storyCraft.first(where: { $0.id == id }) {
            RoverStoryView(roverId: s.id, roverName: s.name, location: s.location,
                           avatarURL: store.avatarURL(for: s.id), startSol: s.sol,
                           owltSeconds: s.owlt) { storyRover = nil }
        }
    }

    private func blockView(_ b: CraftBlock) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Group {
                    if b.avatar != nil {
                        BundleImage(url: b.avatar, contentMode: .fill)
                    } else {
                        Circle().fill(Theme.rule2).overlay(
                            Text(String(b.name.prefix(1))).font(.title(16)).foregroundColor(Theme.dim))
                    }
                }
                .frame(width: 40, height: 40).clipShape(Circle())
                .overlay(Circle().stroke(Theme.rule2, lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text(b.name).font(.title(20)).foregroundColor(Theme.txt)
                    Text(b.location.uppercased()).font(.mono(10)).tracking(1).foregroundColor(Theme.dim)
                }
                Spacer()
            }
            if let l = b.lightLine {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.up.forward").font(.system(size: 9, weight: .bold)).foregroundColor(Theme.delay)
                    Text(l).font(.mono(11)).foregroundColor(Theme.delay)
                }
            }
            LazyVGrid(columns: cols, spacing: 8) {
                ForEach(b.photos) { p in tile(p) }
            }
        }
        .padding(.horizontal, 14).padding(.top, 22).padding(.bottom, 8)
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .top)
    }

    private func tile(_ p: BlockPhoto) -> some View {
        Button { lightbox = p.full } label: {
            ZStack(alignment: .bottomLeading) {
                Rectangle().fill(Color.black).aspectRatio(4.0 / 3.0, contentMode: .fit)
                    .overlay(BundleImage(url: p.thumb, contentMode: .fill)).clipped()
                LinearGradient(colors: [.black.opacity(0.85), .clear], startPoint: .bottom, endPoint: .center)
                VStack(alignment: .leading, spacing: 1) {
                    Text(p.caption).font(.mono(10)).foregroundColor(Theme.txt).lineLimit(1)
                    Text(p.isArchive ? "mission archive" : "arrived \(Fmt.ago(p.arrival ?? Date()))")
                        .font(.mono(10)).foregroundColor(Theme.delay)
                }
                .padding(8)
            }
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.rule2, lineWidth: 1))
        }.buttonStyle(.plain)
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
