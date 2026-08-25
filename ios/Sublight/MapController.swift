import SwiftUI

/// Camera state shared between the map, the HUD, and search "jump-to".
final class MapController: ObservableObject {
    @Published var cam: CGPoint = .zero
    @Published var scale: CGFloat = 0
    var fitScale: CGFloat = 0

    func configure(fit: CGFloat) {
        fitScale = fit
        if scale == 0 { scale = fit }
    }

    func reset() {
        cam = .zero
        scale = fitScale
    }

    func zoom(_ factor: CGFloat) {
        scale = min(max(scale * factor, fitScale * 0.6), fitScale * 90)
    }

    func focus(world: CGPoint) {
        cam = world
        scale = min(max(fitScale * 6, fitScale * 0.6), fitScale * 90)
    }
}
