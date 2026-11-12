import SwiftUI

// Deep Sky — the far end of the light-time ladder (parity with src/ui/DeepSky.tsx).
// Iconic galaxies and nebulae captioned by the age of their light. Images are
// served from the site's CDN; the list/metadata is bundled so it works offline.

private let SITE = "https://sublight.observer"

struct DeepSkyView: View {
    @ObservedObject var store: DataStore
    let onClose: () -> Void

    @State private var open: DeepSkyObject?

    private var sorted: [DeepSkyObject] { store.deepSky.sorted { $0.distanceLy < $1.distanceLy } }

    var body: some View {
        ZStack {
            Theme.void.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // A tab root: the nav bar is the way out, so no back button.
                    Text("Nothing here is new.").font(.titleSemi(34)).titleTracking(34).foregroundColor(Theme.txt)
                        .padding(.top, 8)
                    Text("Beyond the fleet, the light-time stops being minutes and starts being millennia. Every object below is labelled by the age of the light reaching you now.")
                        .font(.sans(17)).foregroundColor(Theme.dim).lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 8)

                    ForEach(sorted) { o in
                        Button { open = o } label: { card(o) }.buttonStyle(.plain)
                    }
                }
                .padding(20).padding(.bottom, 118)
            }
            if let o = open { viewer(o) }
        }
        .preferredColorScheme(.dark)
    }

    private func card(_ o: DeepSkyObject) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Theme.panel2)
                .aspectRatio(16.0 / 9.0, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .overlay(
                    AsyncImage(url: URL(string: SITE + o.file)) { phase in
                        if let img = phase.image { img.resizable().scaledToFill() } else { Color.clear }
                    }
                )
                .clipped()

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(o.name).font(.titleSemi(20)).titleTracking(20).foregroundColor(Theme.txt)
                    Text(o.catalog).font(.mono(12)).foregroundColor(Theme.dim2)
                }
                Text("\(Fmt.lightYears(o.distanceLy)) old").font(.monoMed(17)).foregroundColor(Theme.delay)
                Text(o.note).font(.sans(15)).foregroundColor(Theme.dim).lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                Text(o.credit).font(.sans(12)).foregroundColor(Theme.dim2).padding(.top, 4)
            }
            .padding(18)
        }
        .card()
        .clipShape(RoundedRectangle(cornerRadius: Theme.rL, style: .continuous))
    }

    private func viewer(_ o: DeepSkyObject) -> some View {
        ZStack {
            Color.black.opacity(0.95).ignoresSafeArea().onTapGesture { open = nil }
            VStack(spacing: 16) {
                AsyncImage(url: URL(string: SITE + o.full)) { phase in
                    if let img = phase.image {
                        img.resizable().aspectRatio(contentMode: .fit)
                    } else {
                        ProgressView().tint(Theme.dim)
                    }
                }
                .frame(maxHeight: 420)
                .clipShape(RoundedRectangle(cornerRadius: Theme.rS, style: .continuous))

                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Text(o.name).font(.titleSemi(22)).titleTracking(22).foregroundColor(Theme.txt)
                        Text(o.catalog).font(.mono(12)).foregroundColor(Theme.dim2)
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        MicroLabel("Light age")
                        Text("\(Fmt.lightYears(o.distanceLy))").font(.monoMed(16)).foregroundColor(Theme.delay)
                    }
                    Text(o.note).font(.sans(15)).foregroundColor(Theme.dim).multilineTextAlignment(.center).lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true).padding(.horizontal, 24)
                    Text(o.credit).font(.sans(12)).foregroundColor(Theme.dim2).padding(.top, 4)
                }
            }
            .padding(24)
            VStack {
                HStack {
                    Spacer()
                    Button { open = nil } label: {
                        Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).foregroundColor(Theme.txt)
                            .frame(width: 40, height: 40)
                            .glassPill()
                    }
                }
                Spacer()
            }
        }
        .transition(.opacity)
    }
}
