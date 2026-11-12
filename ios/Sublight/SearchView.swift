import SwiftUI

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
                HStack(spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundColor(Theme.dim)
                        TextField("", text: $query, prompt: Text("Jump to a craft or world").foregroundColor(Theme.dim2))
                            .font(.sans(17)).foregroundColor(Theme.txt)
                            .tint(Theme.signal)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .focused($focused)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Capsule().fill(Theme.panel2))
                    .overlay(Capsule().stroke(Theme.rule, lineWidth: 1))
                    Button(action: onClose) {
                        Text("Close").font(.sansMed(17)).foregroundColor(Theme.signal)
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
                                        Text(row.name).font(.sansMed(17)).foregroundColor(Theme.txt)
                                        Text(row.sub).font(.sans(13))
                                            .foregroundColor(Theme.dim)
                                    }
                                    Spacer()
                                    Image(systemName: "arrow.up.right").font(.system(size: 11))
                                        .foregroundColor(Theme.dim2)
                                }
                                .padding(.horizontal, 20).padding(.vertical, 12)
                            }.buttonStyle(.plain)
                            Rectangle().fill(Theme.rule).frame(height: 1).padding(.leading, 20)
                        }
                    }
                }
            }
        }
        .onAppear { focused = true }
    }
}
