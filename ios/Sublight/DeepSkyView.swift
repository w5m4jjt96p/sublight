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
                    Button(action: onClose) {
                        Text("← BACK TO THE MAP").font(.mono(11)).tracking(1.5).foregroundColor(Theme.dim)
                    }
                    Text("Nothing here is new.").font(.title(30)).foregroundColor(Theme.txt)
                    Text("Beyond the fleet, the light-time stops being minutes and starts being millennia. Every object below is labelled by the age of the light reaching you now.")
                        .font(.mono(13)).foregroundColor(Theme.dim).lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)

                    ForEach(sorted) { o in
                        Button { open = o } label: { card(o) }.buttonStyle(.plain)
                    }
                }
                .padding(20).padding(.bottom, 100)
            }
            if let o = open { viewer(o) }
        }
        .preferredColorScheme(.dark)
    }

    private func card(_ o: DeepSkyObject) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Color(hex: "05070a"))
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
                    Text(o.name).font(.title(19)).foregroundColor(Theme.txt)
                    Text(o.catalog).font(.mono(11)).foregroundColor(Theme.dim2)
                }
                Text("\(Fmt.lightYears(o.distanceLy)) old").font(.monoMed(19)).foregroundColor(Theme.delay)
                Text(o.note).font(.mono(13)).foregroundColor(Theme.dim).lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
                Text(o.credit).font(.mono(9)).foregroundColor(Theme.dim2).padding(.top, 4)
            }
            .padding(16)
        }
        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.panel))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.rule2, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
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
                .overlay(RoundedRectangle(cornerRadius: 2).stroke(Theme.rule2, lineWidth: 1))

                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Text(o.name).font(.title(22)).foregroundColor(Theme.txt)
                        Text(o.catalog).font(.mono(11)).foregroundColor(Theme.dim2)
                    }
                    Text("Its light is \(Fmt.lightYears(o.distanceLy)) old").font(.monoMed(16)).foregroundColor(Theme.delay)
                    Text(o.note).font(.mono(13)).foregroundColor(Theme.dim).multilineTextAlignment(.center).lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true).padding(.horizontal, 24)
                    Text(o.credit).font(.mono(10)).foregroundColor(Theme.dim2).padding(.top, 4)
                }
            }
            .padding(24)
            VStack {
                HStack {
                    Spacer()
                    Button { open = nil } label: {
                        Image(systemName: "xmark").font(.system(size: 16, weight: .medium)).foregroundColor(Theme.dim)
                            .frame(width: 40, height: 40)
                    }
                }
                Spacer()
            }
        }
        .transition(.opacity)
    }
}
