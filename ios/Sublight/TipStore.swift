import Foundation
import StoreKit

/// Optional "support development" tips (consumable in-app purchases). The app
/// stays fully free; this only accepts voluntary support. Product IDs must be
/// created in App Store Connect (and are mirrored in Products.storekit for local
/// testing).
@MainActor
final class TipStore: ObservableObject {
    @Published private(set) var products: [Product] = []
    @Published var purchasingID: String?
    @Published var didThank = false

    private let ids = [
        "observer.sublight.tip.small",
        "observer.sublight.tip.medium",
        "observer.sublight.tip.large",
    ]

    init() { Task { await load() } }

    func load() async {
        let fetched = (try? await Product.products(for: ids)) ?? []
        products = fetched.sorted { $0.price < $1.price }
    }

    func buy(_ product: Product) async {
        purchasingID = product.id
        defer { purchasingID = nil }
        guard let result = try? await product.purchase() else { return }
        if case .success(let verification) = result,
           case .verified(let txn) = verification {
            await txn.finish()      // consumable: nothing to unlock, just say thanks
            didThank = true
        }
    }
}
