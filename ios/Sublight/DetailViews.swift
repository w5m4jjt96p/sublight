import SwiftUI

// MARK: - Shared building blocks

struct BundleImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill
    var body: some View {
        if let ui = ImageStore.shared.image(url) {
            Image(uiImage: ui).resizable().aspectRatio(contentMode: contentMode)
        } else {
            Rectangle().fill(Theme.rule)
        }
    }
}

private struct Kicker: View {
    let text: String
    var color: Color = Theme.dim
    var body: some View {
        Text(text.uppercased())
            .font(.mono(10)).tracking(1.5).foregroundColor(color)
    }
}

private struct StatCell: View {
    let label: String
    let value: String
    var accent: Bool = false
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Kicker(text: label, color: Theme.dim2)
            Text(value)
                .font(.monoMed(15))
                .foregroundColor(accent ? Theme.delay : Theme.txt)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct StatusChip: View {
    let status: String
    private var color: Color {
        switch status {
        case "active": return Theme.signal
        case "cruise": return Theme.signal
        case "dormant": return Theme.dim
        default: return Theme.dead
        }
    }
    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(status.uppercased()).font(.mono(10)).tracking(1.2).foregroundColor(color)
        }
        .padding(.horizontal, 9).padding(.vertical, 5)
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(color.opacity(0.4), lineWidth: 1))
    }
}

private struct SheetChrome<Content: View>: View {
    let content: Content
    init(@ViewBuilder _ content: () -> Content) { self.content = content() }
    var body: some View {
        ZStack {
            Theme.panel.ignoresSafeArea()
            ScrollView { content.padding(20) }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.panel)
    }
}

// MARK: - Craft detail

struct CraftDetail: View {
    @ObservedObject var store: DataStore
    let id: String
    @State private var lightbox: URL?
    @State private var showTraverse = false

    private var craft: Craft? { store.craft.first { $0.id == id } }

    var body: some View {
        SheetChrome {
            if let c = craft {
                VStack(alignment: .leading, spacing: 18) {
                    header(c)
                    if c.isImaging { hero(c) }
                    lightTimeBlock(c)
                    if store.tracks[id] != nil { traverseButton }
                    factsGrid(c)
                    if !c.reg.note.isEmpty { note(c.reg.note) }
                    if let frames = store.frames[id]?.recent, !frames.isEmpty {
                        recentStrip(frames)
                    }
                }
            } else {
                Text("Unknown craft").font(.mono(13)).foregroundColor(Theme.dim)
            }
        }
        .fullScreenCover(item: $lightbox) { url in
            Lightbox(url: url) { lightbox = nil }
        }
        .fullScreenCover(isPresented: $showTraverse) {
            if let track = store.tracks[id] {
                TraverseView(track: track, craftName: craft?.name ?? track.label) { showTraverse = false }
            }
        }
    }

    private func header(_ c: Craft) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Kicker(text: c.reg.agency + " · " + c.reg.kind)
                Spacer()
                StatusChip(status: c.reg.status)
            }
            Text(c.name).font(.title(34)).foregroundColor(Theme.txt).lineSpacing(2)
            Kicker(text: c.reg.location, color: Theme.dim)
        }
    }

    private func hero(_ c: Craft) -> some View {
        let full = store.heroFull(for: id)
        let cap: String? = store.frames[id].map { "\($0.instrument) · \(Fmt.ago($0.capturedUtc))" }
            ?? store.archive[id].map { $0.title }
        return Button { lightbox = full } label: {
            VStack(alignment: .leading, spacing: 6) {
                BundleImage(url: store.heroThumb(for: id))
                    .frame(height: 210).frame(maxWidth: .infinity)
                    .clipped().cornerRadius(6)
                if let cap { Kicker(text: cap, color: Theme.dim) }
            }
        }
        .buttonStyle(.plain)
    }

    private var traverseButton: some View {
        Button { showTraverse = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                    .font(.system(size: 18)).foregroundColor(Theme.signal)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Surface traverse").font(.titleSemi(15)).foregroundColor(Theme.txt)
                    Text("Every drive and photo, on the real map of Mars")
                        .font(.mono(11)).foregroundColor(Theme.dim)
                }
                Spacer()
                Image(systemName: "arrow.right").font(.system(size: 13)).foregroundColor(Theme.dim)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 8).fill(Theme.signal.opacity(0.06)))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.rule2, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func lightTimeBlock(_ c: Craft) -> some View {
        let owlt = c.eph.owltSeconds
        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Kicker(text: "You are seeing light that left", color: Theme.dim)
                Text(Fmt.lightTime(owlt) + " ago")
                    .font(.title(30)).foregroundColor(Theme.delay)
            }
            HStack(spacing: 16) {
                StatCell(label: "One-way delay", value: Fmt.lightTimeShort(owlt), accent: true)
                StatCell(label: "Round trip", value: Fmt.lightTimeShort(owlt * 2), accent: true)
            }
            HStack(spacing: 16) {
                StatCell(label: "Distance", value: Fmt.au(c.eph.rangeAu))
                StatCell(label: "≈", value: Fmt.km(c.eph.rangeAu))
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.void))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.rule2, lineWidth: 1))
    }

    private func factsGrid(_ c: Craft) -> some View {
        let cols = [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]
        return LazyVGrid(columns: cols, alignment: .leading, spacing: 16) {
            StatCell(label: "Launched", value: Fmt.date(c.reg.launched))
            if let arr = c.reg.arrived { StatCell(label: "Arrived", value: Fmt.date(arr)) }
            StatCell(label: "Agency", value: c.reg.agency)
            StatCell(label: "Type", value: c.reg.kind.capitalized)
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.mono(13)).foregroundColor(Theme.dim).lineSpacing(4)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func recentStrip(_ frames: [FrameThumb]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Kicker(text: "Recent frames")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(frames.enumerated()), id: \.offset) { _, f in
                        Button { lightbox = DataStore.imageURL(f.full) } label: {
                            BundleImage(url: DataStore.imageURL(f.file))
                                .frame(width: 110, height: 84).clipped().cornerRadius(4)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

// MARK: - Body detail

struct BodyDetail: View {
    @ObservedObject var store: DataStore
    let id: String
    @State private var lightbox: URL?

    private var info: BodyInfo? { store.bodies[id] }

    var body: some View {
        SheetChrome {
            if let info {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 8) {
                        Kicker(text: info.kind)
                        Text(info.name).font(.title(34)).foregroundColor(Theme.txt)
                    }
                    if let url = store.bodyPhotoURL(id) {
                        Button { lightbox = store.bodyPhotoURL(id, full: true) } label: {
                            BundleImage(url: url)
                                .frame(height: 220).frame(maxWidth: .infinity)
                                .clipped().cornerRadius(6)
                        }.buttonStyle(.plain)
                    }
                    Text(info.blurb)
                        .font(.mono(14)).foregroundColor(Theme.txt).lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                    factsGrid(info)
                    if let credit = info.photo.credit {
                        Kicker(text: "Image · " + credit, color: Theme.dim2)
                    }
                }
            } else {
                Text("No data").font(.mono(13)).foregroundColor(Theme.dim)
            }
        }
        .fullScreenCover(item: $lightbox) { url in
            Lightbox(url: url) { lightbox = nil }
        }
    }

    private func factsGrid(_ info: BodyInfo) -> some View {
        let cols = [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]
        return LazyVGrid(columns: cols, alignment: .leading, spacing: 16) {
            ForEach(info.facts) { f in StatCell(label: f.label, value: f.value) }
        }
    }
}

// URL is Identifiable for .fullScreenCover(item:)
extension URL: Identifiable { public var id: String { absoluteString } }
