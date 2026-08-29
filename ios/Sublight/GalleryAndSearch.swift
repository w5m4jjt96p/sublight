import SwiftUI

// MARK: - Gallery

private struct FeedItem: Identifiable {
    let id: String
    let craft: String
    let location: String
    let avatar: URL?
    let thumb: URL?
    let full: URL?
    let caption: String
    let timeAgo: String
    let lightLine: String?
    let lightSeconds: Double
    let seq: Int
    let isArchive: Bool
}

private enum GalleryTab { case feed, archives }

// A feed of the arriving frames, styled like a social timeline: the rover is the
// author, its location the place, the capture time the "posted" time, and the
// light-travel delay the honest twist under every photo.
struct GalleryView: View {
    @ObservedObject var store: DataStore
    @State private var lightbox: URL?
    @State private var tab: GalleryTab = .feed
    @State private var storyRover: StoryID?

    private struct StoryID: Identifiable { let id: String }

    // Craft with a live per-sol firehose (the Mars rovers): a captured sol number
    // is the tell. Each opens a full-screen "story" of all its raw frames.
    private struct StoryCraft: Identifiable { let id: String; let name: String; let location: String; let sol: Int; let owlt: Double }
    private var storyCraft: [StoryCraft] {
        store.craft.compactMap { c in
            guard let f = store.frames[c.id], let sol = f.sol else { return nil }
            return StoryCraft(id: c.id, name: c.name, location: c.reg.location, sol: sol, owlt: c.eph.owltSeconds)
        }
    }

    private var allItems: [FeedItem] {
        var out: [FeedItem] = []
        var seq = 0
        for c in store.craft {
            let loc = c.reg.location
            let owlt = c.eph.owltSeconds
            let light = owlt > 0 ? "Its light took \(Fmt.lightTime(owlt)) to cross the void" : nil
            let avatar = store.avatarURL(for: c.id)
            func solCap(_ sol: Int?, _ instrument: String) -> String {
                sol.map { "Sol \($0) · \(instrument)" } ?? instrument
            }
            if let f = store.frames[c.id] {
                out.append(FeedItem(id: c.id + "-hero", craft: c.name, location: loc, avatar: avatar,
                                    thumb: DataStore.imageURL(f.file), full: DataStore.imageURL(f.full),
                                    caption: solCap(f.sol, f.instrument), timeAgo: Fmt.ago(f.capturedUtc),
                                    lightLine: light, lightSeconds: owlt, seq: seq, isArchive: false)); seq += 1
                for (i, r) in (f.recent ?? []).enumerated() {
                    out.append(FeedItem(id: "\(c.id)-\(i)", craft: c.name, location: loc, avatar: avatar,
                                        thumb: DataStore.imageURL(r.file), full: DataStore.imageURL(r.full),
                                        caption: solCap(r.sol, r.instrument), timeAgo: Fmt.ago(r.capturedUtc),
                                        lightLine: light, lightSeconds: owlt, seq: seq, isArchive: false)); seq += 1
                }
            } else if let a = store.archive[c.id] {
                out.append(FeedItem(id: c.id + "-arch", craft: c.name, location: loc, avatar: avatar,
                                    thumb: DataStore.imageURL(a.file), full: DataStore.imageURL(a.full),
                                    caption: a.title, timeAgo: "mission archive",
                                    lightLine: light, lightSeconds: owlt, seq: seq, isArchive: true)); seq += 1
            }
        }
        // By the age of the arriving light: the most distant / oldest light first
        // (Voyager down to DSCOVR). Within a craft, keep the curated round-robin
        // order from frames.json (varied cameras) rather than re-grouping by time.
        return out.sorted { a, b in
            a.lightSeconds != b.lightSeconds ? a.lightSeconds > b.lightSeconds : a.seq < b.seq
        }
    }

    private var shown: [FeedItem] {
        allItems.filter { tab == .archives ? $0.isArchive : !$0.isArchive }
    }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            VStack(spacing: 0) {
                tabBar
                ScrollView {
                    LazyVStack(spacing: 0) {
                        if tab == .feed && !storyCraft.isEmpty { storiesRail }
                        ForEach(shown) { item in card(item) }
                    }
                    .padding(.bottom, 100)
                }
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

    private var tabBar: some View {
        HStack(spacing: 0) {
            tabButton("Feed", .feed)
            tabButton("Archives", .archives)
        }
        .padding(.horizontal, 12).padding(.top, 8)
        .background(Theme.void)
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .bottom)
    }

    private func tabButton(_ title: String, _ t: GalleryTab) -> some View {
        Button { tab = t } label: {
            VStack(spacing: 8) {
                Text(title).font(.monoMed(14)).foregroundColor(tab == t ? Theme.txt : Theme.dim)
                Rectangle().fill(tab == t ? Theme.signal : Color.clear).frame(height: 2)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    private func card(_ item: FeedItem) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Group {
                    if item.avatar != nil {
                        BundleImage(url: item.avatar, contentMode: .fill)
                    } else {
                        Circle().fill(Theme.rule2).overlay(
                            Text(String(item.craft.prefix(1))).font(.title(15)).foregroundColor(Theme.dim))
                    }
                }
                .frame(width: 38, height: 38).clipShape(Circle())
                .overlay(Circle().stroke(Theme.rule2, lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.craft).font(.monoMed(14)).foregroundColor(Theme.txt)
                    Text(item.location).font(.mono(11)).foregroundColor(Theme.dim)
                }
                Spacer()
                Text(item.timeAgo).font(.mono(11)).foregroundColor(Theme.dim2)
            }
            .padding(.horizontal, 14).padding(.vertical, 11)

            Button { lightbox = item.full } label: {
                BundleImage(url: item.thumb, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .frame(maxHeight: 460)
                    .background(Color.black)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 6) {
                Text(item.caption).font(.mono(12)).foregroundColor(Theme.txt)
                if let l = item.lightLine {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.forward").font(.system(size: 9, weight: .bold)).foregroundColor(Theme.delay)
                        Text(l).font(.mono(11)).foregroundColor(Theme.delay)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 16)

            Rectangle().fill(Theme.rule).frame(height: 1)
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
