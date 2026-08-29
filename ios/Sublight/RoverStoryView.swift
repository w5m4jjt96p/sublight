import SwiftUI

// A rover "story": the full firehose of a rover's raw frames, full-screen and
// tappable like an Instagram story. The gallery feed shows only a curated
// handful; here we live-fetch a whole sol at a time (all of it, thumbnails
// filtered) from mars.nasa.gov, and when the viewer reaches the end we load the
// previous sol — so the entire archive is reachable, newest first. Every frame
// still carries the honest twist: the light is already hours old.

@MainActor
final class RoverStoryModel: ObservableObject {
    @Published var frames: [RoverImage] = []
    @Published var index = 0
    @Published var loading = true
    @Published var done = false

    let roverId: String
    private var nextSol: Int
    private var loadingNow = false
    private var pending = false           // a "next" tap that ran past the loaded end
    private let storyLimit = 600          // whole-sol fetch
    private let solFloor = 0

    init(roverId: String, startSol: Int) {
        self.roverId = roverId
        self.nextSol = startSol
    }

    var current: RoverImage? { frames.indices.contains(index) ? frames[index] : nil }
    var fraction: CGFloat { frames.isEmpty ? 0 : CGFloat(index + 1) / CGFloat(frames.count) }

    func loadMore() async {
        if loadingNow || done { return }
        loadingNow = true; loading = true
        var sol = nextSol
        var added: [RoverImage] = []
        var tries = 0
        // Descend past the occasional empty sol so a gap never dead-ends the story.
        while tries < 8 && sol >= solFloor {
            let d = await RoverImages.fetch(roverId: roverId, sol: sol, limit: storyLimit)
            if !d.images.isEmpty { added = d.images; break }
            sol -= 1; tries += 1
        }
        nextSol = sol - 1
        if !added.isEmpty { frames.append(contentsOf: added) }
        if nextSol < solFloor || (added.isEmpty && sol < solFloor) { done = true }
        loadingNow = false; loading = false
        if pending {
            pending = false
            if index + 1 < frames.count { index += 1 }
        }
    }

    func next() {
        if index + 1 < frames.count {
            index += 1
            if index >= frames.count - 5 { Task { await loadMore() } } // prefetch next sol
        } else if !done {
            pending = true
            Task { await loadMore() }
        }
    }

    func prev() { if index > 0 { index -= 1 } }
}

struct RoverStoryView: View {
    let roverName: String
    let location: String
    let avatarURL: URL?
    let owltSeconds: Double
    let onClose: () -> Void

    @StateObject private var model: RoverStoryModel
    @State private var dragY: CGFloat = 0

    init(roverId: String, roverName: String, location: String, avatarURL: URL?,
         startSol: Int, owltSeconds: Double, onClose: @escaping () -> Void) {
        self.roverName = roverName
        self.location = location
        self.avatarURL = avatarURL
        self.owltSeconds = owltSeconds
        self.onClose = onClose
        _model = StateObject(wrappedValue: RoverStoryModel(roverId: roverId, startSol: startSol))
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let cur = model.current {
                AsyncImage(url: cur.full) { phase in
                    switch phase {
                    case .success(let img): img.resizable().aspectRatio(contentMode: .fit)
                    case .empty: ProgressView().tint(.white)
                    default: Text("Couldn't load frame").font(.mono(12)).foregroundColor(Theme.dim)
                    }
                }
                .id(cur.id)
            } else {
                ProgressView().tint(.white)
            }

            // Tap zones: left third = back, right two-thirds = forward. Inset
            // from the top/bottom so they never sit under the header (close
            // button) or the footer caption — tapping those must not advance.
            GeometryReader { geo in
                HStack(spacing: 0) {
                    Color.clear.contentShape(Rectangle())
                        .frame(width: geo.size.width / 3)
                        .onTapGesture { model.prev() }
                    Color.clear.contentShape(Rectangle())
                        .onTapGesture { model.next() }
                }
            }
            .padding(.top, 96).padding(.bottom, 104)

            VStack(spacing: 0) {
                topBar
                Spacer(minLength: 0)
                bottomBar
            }
        }
        .offset(y: dragY)
        .gesture(
            DragGesture()
                .onChanged { v in if v.translation.height > 0 { dragY = v.translation.height } }
                .onEnded { v in
                    if v.translation.height > 120 { onClose() }
                    else { withAnimation(.spring(response: 0.3)) { dragY = 0 } }
                }
        )
        .task { await model.loadMore() }
        .statusBarHidden(true)
    }

    private var topBar: some View {
        VStack(spacing: 12) {
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.22))
                    Capsule().fill(Color.white).frame(width: g.size.width * model.fraction)
                }
            }
            .frame(height: 2.5)

            HStack(spacing: 10) {
                avatar
                VStack(alignment: .leading, spacing: 1) {
                    Text(roverName).font(.monoMed(14)).foregroundColor(.white)
                    Text(location).font(.mono(11)).foregroundColor(.white.opacity(0.6))
                }
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 16, weight: .medium)).foregroundColor(.white)
                        .padding(8)
                }
            }
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 22)
        .background(LinearGradient(colors: [.black.opacity(0.7), .clear], startPoint: .top, endPoint: .bottom))
    }

    private var avatar: some View {
        Group {
            if let url = avatarURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().aspectRatio(contentMode: .fill)
                    default: Circle().fill(Theme.rule2).overlay(
                        Text(String(roverName.prefix(1))).font(.title(15)).foregroundColor(Theme.dim))
                    }
                }
            } else {
                Circle().fill(Theme.rule2).overlay(
                    Text(String(roverName.prefix(1))).font(.title(15)).foregroundColor(Theme.dim))
            }
        }
        .frame(width: 34, height: 34).clipShape(Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.3), lineWidth: 1))
    }

    private var bottomBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let cur = model.current {
                Text(caption(cur)).font(.mono(13)).foregroundColor(.white)
                if owltSeconds > 0 {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.forward").font(.system(size: 9, weight: .bold)).foregroundColor(Theme.delay)
                        Text(lightLine(cur)).font(.mono(12)).foregroundColor(Theme.delay)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16).padding(.top, 26).padding(.bottom, 28)
        .background(LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .top, endPoint: .bottom))
    }

    private func caption(_ img: RoverImage) -> String {
        let instr = img.instrument.replacingOccurrences(of: "_", with: " ")
        let sol = img.sol > 0 ? "Sol \(img.sol) · " : ""
        let tail = model.done ? "" : "+"
        return "\(sol)\(instr) · \(model.index + 1) of \(model.frames.count)\(tail)"
    }

    private func lightLine(_ img: RoverImage) -> String {
        var s = "Its light took \(Fmt.lightTime(owltSeconds)) to cross the void"
        if !img.capturedUtc.isEmpty { s += " · left \(Fmt.ago(img.capturedUtc))" }
        return s
    }
}
