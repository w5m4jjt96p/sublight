import SwiftUI

// MARK: - Gallery

private struct GalleryItem: Identifiable {
    let id: String
    let thumb: URL?
    let full: URL?
    let craft: String
    let caption: String
}

struct GalleryView: View {
    @ObservedObject var store: DataStore
    let onClose: () -> Void
    @State private var lightbox: URL?

    private var items: [GalleryItem] {
        var out: [GalleryItem] = []
        for c in store.craft {
            if let f = store.frames[c.id] {
                out.append(GalleryItem(id: c.id + "-hero", thumb: DataStore.imageURL(f.file),
                                       full: DataStore.imageURL(f.full), craft: c.name,
                                       caption: "\(f.instrument) · \(Fmt.ago(f.capturedUtc))"))
                for (i, r) in (f.recent ?? []).enumerated() {
                    out.append(GalleryItem(id: "\(c.id)-\(i)", thumb: DataStore.imageURL(r.file),
                                           full: DataStore.imageURL(r.full), craft: c.name,
                                           caption: "\(r.instrument) · \(Fmt.ago(r.capturedUtc))"))
                }
            } else if let a = store.archive[c.id] {
                out.append(GalleryItem(id: c.id + "-arch", thumb: DataStore.imageURL(a.file),
                                       full: DataStore.imageURL(a.full), craft: c.name, caption: a.title))
            }
        }
        return out
    }

    private let cols = [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)]

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                ScrollView {
                    LazyVGrid(columns: cols, spacing: 3) {
                        ForEach(items) { item in
                            Button { lightbox = item.full } label: {
                                ZStack(alignment: .bottomLeading) {
                                    BundleImage(url: item.thumb)
                                        .frame(height: 150).frame(maxWidth: .infinity).clipped()
                                    LinearGradient(colors: [.clear, .black.opacity(0.7)],
                                                   startPoint: .center, endPoint: .bottom)
                                        .frame(height: 150)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(item.craft).font(.mono(9)).foregroundColor(Theme.txt)
                                        Text(item.caption).font(.mono(8)).foregroundColor(Theme.dim)
                                    }.padding(6)
                                }
                            }.buttonStyle(.plain)
                        }
                    }.padding(3)
                }
            }
        }
        .fullScreenCover(item: $lightbox) { url in Lightbox(url: url) { lightbox = nil } }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("The wall of arriving light").font(.title(22)).foregroundColor(Theme.txt)
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
