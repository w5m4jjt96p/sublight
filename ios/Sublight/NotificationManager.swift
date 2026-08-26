import Foundation
import UserNotifications
import BackgroundTasks

/// New-imagery notifications without a backend: a background refresh task checks
/// the deployed frames.json (only updated by the daily job when there is genuine
/// new data) and fires a LOCAL notification when a frame newer than the last one
/// we told the user about appears. iOS decides when the task actually runs, so
/// this is opportunistic (roughly daily with regular use), not a fixed alarm.
final class NotificationManager {
    static let shared = NotificationManager()
    static let taskId = "observer.sublight.refresh"

    private let framesURL = URL(string: "https://sublight.observer/data/frames.json")!
    private let enabledKey = "notificationsEnabled"
    private let lastKey = "lastNotifiedCapture"

    private let friendly: [String: String] = [
        "perseverance": "Perseverance", "curiosity": "Curiosity", "dscovr": "DSCOVR",
    ]

    var isEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: enabledKey) }
        set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    /// Ask permission and turn the feature on. Returns whether it's now enabled.
    @MainActor
    func enable() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        isEnabled = granted
        if granted {
            // Seed the baseline so we only notify about frames from here on.
            if UserDefaults.standard.string(forKey: lastKey) == nil {
                _ = await latestCapture().map { UserDefaults.standard.set($0.utc, forKey: lastKey) }
            }
            scheduleRefresh()
        }
        return granted
    }

    func disable() {
        isEnabled = false
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskId)
    }

    /// Submit the next opportunistic background refresh (~8h out).
    func scheduleRefresh() {
        guard isEnabled else { return }
        let req = BGAppRefreshTaskRequest(identifier: Self.taskId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 8 * 3600)
        try? BGTaskScheduler.shared.submit(req)
    }

    /// Called from the background task: check for a newer frame and notify once.
    func checkForNewImagery() async {
        guard isEnabled else { return }
        guard let newest = await latestCapture() else { return }
        let last = UserDefaults.standard.string(forKey: lastKey) ?? ""
        guard newest.utc > last else { return }
        UserDefaults.standard.set(newest.utc, forKey: lastKey)

        let name = friendly[newest.craft] ?? newest.craft.capitalized
        let content = UNMutableNotificationContent()
        content.title = "New imagery from \(name)"
        content.body = "A fresh frame just arrived across the solar system. Open Sublight to see how old its light already is."
        content.sound = .default
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(req)
    }

    /// Newest capture time across the imaging craft in the deployed frames.json.
    private func latestCapture() async -> (craft: String, utc: String)? {
        guard let (data, _) = try? await URLSession.shared.data(from: framesURL),
              let frames = try? JSONDecoder().decode([String: FrameData].self, from: data)
        else { return nil }
        var best: (craft: String, utc: String)?
        for (id, f) in frames where !f.capturedUtc.isEmpty {
            if best == nil || f.capturedUtc > best!.utc { best = (id, f.capturedUtc) }
        }
        return best
    }
}
