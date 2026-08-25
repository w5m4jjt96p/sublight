import SwiftUI

struct Lightbox: View {
    let url: URL?
    let onClose: () -> Void
    @State private var scale: CGFloat = 1
    @GestureState private var pinch: CGFloat = 1

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let ui = ImageStore.shared.image(url) {
                Image(uiImage: ui)
                    .resizable().aspectRatio(contentMode: .fit)
                    .scaleEffect(scale * pinch)
                    .gesture(
                        MagnificationGesture()
                            .updating($pinch) { v, s, _ in s = v }
                            .onEnded { v in scale = min(max(scale * v, 1), 5) }
                    )
                    .onTapGesture(count: 2) {
                        withAnimation { scale = scale > 1 ? 1 : 2.5 }
                    }
            }
            VStack {
                HStack {
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(Theme.txt)
                            .padding(12)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }
                }
                Spacer()
            }
            .padding(16)
        }
    }
}
