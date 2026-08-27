import Foundation

// Editorial, time-invariant — mirror of src/data/marsSites.ts. Coordinates are
// published historical facts (landing sites) or standard feature centres, in
// areocentric East longitude [0,360) and planetographic latitude.

enum MarsSiteKind: String { case rover, lander, feature }

struct MarsSite: Identifiable {
    let id: String
    let name: String
    let lat: Double
    let lon: Double // deg East
    let kind: MarsSiteKind
    let year: Int?
    let craftId: String?
    let note: String
}

let MARS_SITES: [MarsSite] = [
    .init(id: "perseverance", name: "Perseverance", lat: 18.44, lon: 77.45, kind: .rover, year: 2021, craftId: "perseverance", note: "Jezero Crater, a dried river delta. Still driving."),
    .init(id: "curiosity", name: "Curiosity", lat: -4.59, lon: 137.44, kind: .rover, year: 2012, craftId: "curiosity", note: "Gale Crater, climbing Mount Sharp. Still driving."),
    .init(id: "viking-1", name: "Viking 1", lat: 22.27, lon: 312.05, kind: .lander, year: 1976, craftId: nil, note: "The first fully successful Mars landing, Chryse Planitia."),
    .init(id: "viking-2", name: "Viking 2", lat: 47.64, lon: 134.29, kind: .lander, year: 1976, craftId: nil, note: "Utopia Planitia."),
    .init(id: "pathfinder", name: "Mars Pathfinder", lat: 19.13, lon: 326.79, kind: .lander, year: 1997, craftId: nil, note: "Carried Sojourner, the first Mars rover, to Ares Vallis."),
    .init(id: "spirit", name: "Spirit", lat: -14.57, lon: 175.47, kind: .lander, year: 2004, craftId: nil, note: "Gusev Crater. Twin of Opportunity."),
    .init(id: "opportunity", name: "Opportunity", lat: -1.95, lon: 354.47, kind: .lander, year: 2004, craftId: nil, note: "Meridiani Planum. Drove for 14 years."),
    .init(id: "phoenix", name: "Phoenix", lat: 68.22, lon: 234.25, kind: .lander, year: 2008, craftId: nil, note: "High northern plains. Confirmed subsurface water ice."),
    .init(id: "insight", name: "InSight", lat: 4.50, lon: 135.62, kind: .lander, year: 2018, craftId: nil, note: "Elysium Planitia. Listened for marsquakes."),
    .init(id: "zhurong", name: "Zhurong", lat: 25.1, lon: 109.9, kind: .lander, year: 2021, craftId: nil, note: "China's first Mars rover, Utopia Planitia."),
    .init(id: "olympus", name: "Olympus Mons", lat: 18.65, lon: 226.2, kind: .feature, year: nil, craftId: nil, note: "The tallest volcano in the solar system, about 22 km high."),
    .init(id: "valles", name: "Valles Marineris", lat: -13.9, lon: 301.4, kind: .feature, year: nil, craftId: nil, note: "A canyon system over 4000 km long."),
    .init(id: "hellas", name: "Hellas Planitia", lat: -42.4, lon: 70.5, kind: .feature, year: nil, craftId: nil, note: "One of the largest impact basins in the solar system."),
]
