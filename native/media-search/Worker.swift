import Foundation
import OmniKit
import PDFKit
import ImageIO
import UniformTypeIdentifiers
import CryptoKit

struct MediaRequest: Decodable {
    let id: String
    let query: String?
    let image: String?
    let expectedFiles: Int
    let kind: String
}
struct MediaHit: Encodable {
    let path: String
    let score: Float
    let kind: String
    let page: Int?
    let chunkCount: Int
    let width: Int
    let height: Int
}
struct MediaResponse: Encodable {
    let version = 1
    let id: String
    let indexedFiles: Int
    let modelLoads = 1
    let modelReused: Bool
    let processId = ProcessInfo.processInfo.processIdentifier
    let hits: [MediaHit]
}
@main struct MediaWorker {
    enum Failure: Error { case arguments, inventory, query, locator, render }
    static func main() async throws {
        let args = CommandLine.arguments
        if args.count == 5 && args[1] == "--render" {
            try render(path: args[2], page: Int(args[3]) ?? 0, output: args[4]); return
        }
        guard args.count == 5, args[4] == "--serve" else { throw Failure.arguments }
        try WorkerMemory.prepare(modelDirectory: args[1])
        let engine = try await OmniEngine(modelDir: URL(fileURLWithPath: args[1]), keepVision: true, keepAudio: false)
        WorkerMemory.settle()
        let store = try VectorStore(dbURL: URL(fileURLWithPath: args[3]))
        defer { store.close() }
        var completed = 0
        var fingerprints: [String: String] = [:]
        while let line = readLine() {
            guard line.utf8.count <= 4096 else { throw Failure.arguments }
            let r = try JSONDecoder().decode(MediaRequest.self, from: Data(line.utf8))
            guard !r.id.isEmpty, r.expectedFiles > 0, ["all", "image", "scan"].contains(r.kind),
                  (r.query == nil) != (r.image == nil) else { throw Failure.arguments }
            let corpus = URL(fileURLWithPath: args[2])
            let originals = try inventory(corpus)
            let scanRoot = corpus.deletingLastPathComponent().appendingPathComponent("scan-pages")
            let aliases = try prepareMixedScans(originals, scanRoot: scanRoot)
            let admitted = originals.union(aliases.keys)
            let currentFingerprints = try Dictionary(uniqueKeysWithValues: admitted.map { path in
                (path, SHA256.hash(data: try Data(contentsOf: URL(fileURLWithPath: path))).map { String(format: "%02x", $0) }.joined())
            })
            var stale = Set<String>()
            store.knownFiles().forEach { path, _ in if !admitted.contains(path) || (fingerprints[path] != nil && fingerprints[path] != currentFingerprints[path]) { stale.insert(path) } }
            if !stale.isEmpty { store.deletePaths(stale) }
            var settings = IndexSettings(enabledKinds: [.image, .text])
            settings.ignore = OmniIgnore(text: "")
            Indexer(store: store, embedder: engine).index(roots: [corpus, scanRoot], settings: settings) { _ in }
            guard store.fileCount == r.expectedFiles + aliases.count else { throw Failure.inventory }
            fingerprints = currentFingerprints
            let vector: [Float]
            if let query = r.query {
                guard !query.isEmpty, query.count <= 256 else { throw Failure.query }
                vector = engine.embedText(query, as: .query)
            } else {
                guard let image = r.image, let v = engine.embedFileQuery(URL(fileURLWithPath: image), asDocument: true) else { throw Failure.query }
                vector = v
            }
            var filter = SearchFilter()
            filter.kinds = r.kind == "all" ? ["image", "scan"] : [r.kind]
            let hits = try store.search(vector, filter: filter, topK: 10, textQuery: r.query).map { h in
                var page: Int? = nil
                if h.kind == "scan" {
                    guard h.locator.hasPrefix("Page "), let p = Int(h.locator.dropFirst(5)), p > 0, p == h.chunkIndex + 1 else { throw Failure.locator }
                    page = p
                }
                if let alias = aliases[h.path] {
                    guard let p = page, p <= alias.pages.count else { throw Failure.locator }
                    return MediaHit(path: alias.path, score: h.score, kind: h.kind, page: alias.pages[p - 1], chunkCount: alias.total, width: h.width, height: h.height)
                }
                return MediaHit(path: h.path, score: h.score, kind: h.kind, page: page, chunkCount: h.chunkCount, width: h.width, height: h.height)
            }
            let result = MediaResponse(id: r.id, indexedFiles: originals.count, modelReused: completed > 0, hits: hits)
            WorkerMemory.settle()
            FileHandle.standardOutput.write(try JSONEncoder().encode(result)); FileHandle.standardOutput.write(Data([10]))
            completed += 1
        }
    }
    struct ScanAlias { let path: String; let pages: [Int]; let total: Int }
    static func prepareMixedScans(_ paths: Set<String>, scanRoot: URL) throws -> [String: ScanAlias] {
        let fm = FileManager.default
        try fm.createDirectory(at: scanRoot, withIntermediateDirectories: true)
        var aliases: [String: ScanAlias] = [:]
        for path in paths.sorted() where URL(fileURLWithPath: path).pathExtension.lowercased() == "pdf" {
            let url = URL(fileURLWithPath: path)
            guard let doc = PDFDocument(url: url), !doc.isLocked else { throw Failure.inventory }
            // Entire scans retain the same extraction and streaming path.
            guard case .pagedText = try FileExtractor.extract(url) else { continue }
            let scanPages = (0..<doc.pageCount).filter { (doc.page(at: $0)?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines).count < FileExtractor.minCharsPerPage }
            guard !scanPages.isEmpty else { continue }
            let key = SHA256.hash(data: try Data(contentsOf: url) + Data(path.utf8)).map { String(format: "%02x", $0) }.joined()
            let output = scanRoot.appendingPathComponent(key + ".pdf")
            if !fm.fileExists(atPath: output.path) {
                let scans = PDFDocument()
                for (i, pageIndex) in scanPages.enumerated() {
                    guard let page = doc.page(at: pageIndex)?.copy() as? PDFPage else { throw Failure.render }
                    scans.insert(page, at: i)
                }
                guard scans.write(to: output) else { throw Failure.render }
            }
            aliases[output.path] = ScanAlias(path: path, pages: scanPages.map { $0 + 1 }, total: doc.pageCount)
        }
        for url in try fm.contentsOfDirectory(at: scanRoot, includingPropertiesForKeys: nil) where aliases[url.path] == nil { try fm.removeItem(at: url) }
        return aliases
    }
    static func inventory(_ corpus: URL) throws -> Set<String> {
        guard let files = FileManager.default.enumerator(at: corpus, includingPropertiesForKeys: [.isRegularFileKey]) else { throw Failure.inventory }
        var admitted = Set<String>()
        for case let url as URL in files {
            if try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true { admitted.insert(url.path) }
        }
        return admitted
    }
    static func render(path: String, page: Int, output: String) throws {
        let image: CGImage
        let url = URL(fileURLWithPath: path)
        if page > 0 {
            guard let doc = PDFDocument(url: url), page <= doc.pageCount,
                  let img = FileExtractor.renderPDFPage(doc, index: page - 1, maxDimension: 1024) else { throw Failure.render }
            image = img
        } else {
            guard case .images(let imgs) = try FileExtractor.extract(url, maxImageDimension: 1024), let img = imgs.first else { throw Failure.render }
            image = img
        }
        guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil) else { throw Failure.render }
        CGImageDestinationAddImage(dest, image, nil)
        guard CGImageDestinationFinalize(dest) else { throw Failure.render }
    }
}
