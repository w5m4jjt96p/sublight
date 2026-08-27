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
    let sortDate: Date
}

private func parseUTC(_ iso: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: iso) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: iso)
}

// A feed of the arriving frames, styled like a social timeline: the rover is the
// author, its location the place, the capture time the "posted" time, and the
// light-travel delay the honest twist under every photo.
struct GalleryView: View {
    @ObservedObject var store: DataStore
    let onClose: () -> Void
    @State private var lightbox: URL?

    private var items: [FeedItem] {
        var out: [FeedItem] = []
        for c in store.craft {
            let loc = c.reg.location
            let owlt = c.eph.owltSeconds
            let light = owlt > 0 ? "Its light took \(Fmt.lightTime(owlt)) to cross the void" : nil
            let avatar = store.heroThumb(for: c.id)
            func solCap(_ sol: Int?, _ instrument: String) -> String {
                sol.map { "Sol \($0) · \(instrument)" } ?? instrument
            }
            if let f = store.frames[c.id] {
                out.append(FeedItem(id: c.id + "-hero", craft: c.name, location: loc, avatar: avatar,
                                    thumb: DataStore.imageURL(f.file), full: DataStore.imageURL(f.full),
                                    caption: solCap(f.sol, f.instrument), timeAgo: Fmt.ago(f.capturedUtc),
                                    lightLine: light, sortDate: parseUTC(f.capturedUtc) ?? .distantPast))
                for (i, r) in (f.recent ?? []).enumerated() {
                    out.append(FeedItem(id: "\(c.id)-\(i)", craft: c.name, location: loc, avatar: avatar,
                                        thumb: DataStore.imageURL(r.file), full: DataStore.imageURL(r.full),
                                        caption: solCap(r.sol, r.instrument), timeAgo: Fmt.ago(r.capturedUtc),
                                        lightLine: light, sortDate: parseUTC(r.capturedUtc) ?? .distantPast))
                }
            } else if let a = store.archive[c.id] {
                out.append(FeedItem(id: c.id + "-arch", craft: c.name, location: loc, avatar: avatar,
                                    thumb: DataStore.imageURL(a.file), full: DataStore.imageURL(a.full),
                                    caption: a.title, timeAgo: "mission archive",
                                    lightLine: light, sortDate: .distantPast))
            }
        }
        // Newest first per craft, then interleave craft by craft so the feed
        // opens with variety (one from each) instead of a run of one source.
        let sorted = out.sorted { $0.sortDate > $1.sortDate }
        var byCraft: [String: [FeedItem]] = [:]
        var order: [String] = []
        for item in sorted {
            if byCraft[item.craft] == nil { order.append(item.craft) }
            byCraft[item.craft, default: []].append(item)
        }
        var result: [FeedItem] = []
        var i = 0
        while true {
            var added = false
            for craft in order {
                if let arr = byCraft[craft], i < arr.count { result.append(arr[i]); added = true }
            }
            if !added { break }
            i += 1
        }
        return result
    }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(items) { item in card(item) }
                    }
                    .padding(.bottom, 100)
                }
            }
        }
        .fullScreenCover(item: $lightbox) { url in Lightbox(url: url) { lightbox = nil } }
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

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Arriving light").font(.title(22)).foregroundColor(Theme.txt)
                Text("Every frame is as old as its journey here")
                    .font(.mono(10)).foregroundColor(Theme.dim)
            }
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark").font(.system(size: 15, weight: .medium))
                    .foregroundColor(Theme.txt).padding(10)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(Theme.panel)
        .overlay(Rectangle().fill(Theme.rule).frame(height: 1), alignment: .bottom)
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
