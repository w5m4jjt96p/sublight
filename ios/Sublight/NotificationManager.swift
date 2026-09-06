import Foundation
import UserNotifications
import BackgroundTasks

/// What a notification points at: one publication in the feed. The id is built
/// the same way `FeedStore` builds its group ids, so a tap can scroll straight
/// to the card without any lookup table.
struct FeedTarget: Equatable, Sendable {
    let craftId: String
    let sol: Int?
    var groupId: String { FeedTarget.key(craftId, sol) }

    static func key(_ craftId: String, _ sol: Int?) -> String {
        "\(craftId)|" + (sol.map { "sol\($0)" } ?? "archive")
    }
}

/// New-post notifications without a backend: a background refresh task reads the
/// same live NASA feeds the gallery reads, and fires a LOCAL notification for
/// each publication (one rover, one sol) it has not announced yet. iOS decides
/// when the task actually runs, so this is opportunistic, not a fixed alarm.
///
/// The unit is deliberately the *post*, not the frame. A rover uploads a sol in
/// one burst of dozens of frames; one banner per frame would be unusable, and
/// one banner per day would miss most of what arrives.
final class NotificationManager: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()
    static let taskId = "observer.sublight.refresh"

    /// Set when the user taps a notification. `ContentView` switches to the
    /// gallery on it, `FeedView` scrolls to it and clears it.
    @MainActor @Published var pendingTarget: FeedTarget?

    private let enabledKey = "notificationsEnabled"
    private let seenKey = "notifiedPublications"
    /// Enough history that a rover paging back a few sols is never re-announced,
    /// small enough that the list stays cheap to read on every check.
    private let seenLimit = 60

    /// The craft whose feeds `RoverImages` can actually poll live.
    private let watched = ["perseverance", "curiosity"]
    private let friendly: [String: String] = [
        "perseverance": "Perseverance", "curiosity": "Curiosity", "dscovr": "DSCOVR",
    ]

    private override init() { super.init() }

    var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: enabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    // MARK: - Opening a notification

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        if let craft = info["craftId"] as? String {
            let sol = info["sol"] as? Int
            Task { @MainActor in self.pendingTarget = FeedTarget(craftId: craft, sol: sol) }
        }
        completionHandler()
    }

    // MARK: - Enabling

    /// Ask permission and turn the feature on. Returns whether it's now enabled.
    @MainActor
    func enable() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        isEnabled = granted
        if granted {
            // Adopt what is already published as the baseline, so switching the
            // feature on doesn't immediately announce a backlog.
            if seen().isEmpty {
                markPublicationsSeen(await currentPublications().map { $0.key })
            }
            scheduleRefresh()
        }
        return granted
    }

    func disable() {
        isEnabled = false
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskId)
    }

    /// Submit the next opportunistic background refresh. Two hours is roughly
    /// the spacing of NASA's own publication bursts; iOS will still run it when
    /// it wants to, which is usually less often.
    func scheduleRefresh() {
        guard isEnabled else { return }
        let req = BGAppRefreshTaskRequest(identifier: Self.taskId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 2 * 3600)
        try? BGTaskScheduler.shared.submit(req)
    }

    // MARK: - Checking

    /// Called from the background task: announce publications we haven't yet.
    func checkForNewImagery() async {
        guard isEnabled else { return }
        let known = Set(seen())
        let pubs = await currentPublications()
        guard !pubs.isEmpty else { return }

        // No baseline yet (permission granted while offline, say): take one now
        // rather than announcing every sol currently on the wire.
        guard !known.isEmpty else {
            markPublicationsSeen(pubs.map { $0.key })
            return
        }

        let fresh = pubs.filter { !known.contains($0.key) }
        guard !fresh.isEmpty else { return }
        // A rover can publish two or three sols in one burst. Announce the
        // newest few and mark the rest read: a stack of banners reads as spam.
        for p in fresh.prefix(3) { await notify(p) }
        markPublicationsSeen(fresh.map { $0.key })
    }

    private struct Publication {
        let craftId: String
        let sol: Int
        let frames: Int
        var key: String { FeedTarget.key(craftId, sol) }
    }

    /// The publications sitting at the top of each watched rover's live feed,
    /// newest sol first. Forced past the cache: a background check that reads a
    /// five-minute-old answer is the one case where the cache is wrong.
    private func currentPublications() async -> [Publication] {
        var out: [Publication] = []
        for craftId in watched {
            let images = await RoverImages.fetchLatest(roverId: craftId, limit: 48, force: true)
            var bySol: [Int: Int] = [:]
            for i in images where i.sol > 0 { bySol[i.sol, default: 0] += 1 }
            out.append(contentsOf: bySol.map { Publication(craftId: craftId, sol: $0.key, frames: $0.value) })
        }
        return out.sorted { $0.sol > $1.sol }
    }

    private func notify(_ p: Publication) async {
        let name = friendly[p.craftId] ?? p.craftId.capitalized
        let content = UNMutableNotificationContent()
        content.title = "\(name) · Sol \(p.sol)"
        content.body = p.frames == 1
            ? "A new frame just reached Earth. None of it is happening now."
            : "\(p.frames) new frames just reached Earth. None of it is happening now."
        content.sound = .default
        content.userInfo = ["craftId": p.craftId, "sol": p.sol]
        let req = UNNotificationRequest(identifier: p.key, content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(req)
    }

    // MARK: - What we've already announced

    /// Also called by the feed for every card that scrolls into view: a post the
    /// user has already looked at must never arrive later as news.
    func markPublicationsSeen(_ keys: [String]) {
        guard !keys.isEmpty else { return }
        var all = seen()
        var changed = false
        for k in keys where !all.contains(k) { all.append(k); changed = true }
        guard changed else { return }
        if all.count > seenLimit { all.removeFirst(all.count - seenLimit) }
        UserDefaults.standard.set(all, forKey: seenKey)
    }

    private func seen() -> [String] { UserDefaults.standard.stringArray(forKey: seenKey) ?? [] }
}
