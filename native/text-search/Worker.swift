import Foundation
import OmniKit
import CryptoKit

struct Request: Decodable {
    let id: String?
    let query: String
    let expectedFiles: Int
}

struct Hit: Encodable {
    let path: String
    let score: Float
    let line: Int
    let chunkIndex: Int
    let locator: String
}

struct Response: Encodable {
    let version = 2
    let id: String
    let modelLoads = 1
    let modelReused: Bool
    let processId = ProcessInfo.processInfo.processIdentifier
    let indexedFiles: Int
    let hits: [Hit]
}

@main struct TextSearchWorker {
    static func main() async throws {
        let args = CommandLine.arguments
        guard args.count == 4 || (args.count == 5 && args[4] == "--serve") else { throw Failure.invalidArguments }
        let serving = args.count == 5
        try WorkerMemory.prepare(modelDirectory: args[1])
        let engine = try await OmniEngine(modelDir: URL(fileURLWithPath: args[1]), keepVision: false, keepAudio: false)
        WorkerMemory.settle()
        let store = try VectorStore(dbURL: URL(fileURLWithPath: args[3]))
        defer { store.close() }
        var completed = 0
        while let data = nextRequest(serving: serving, completed: completed) {
            guard data.count <= 4096 else { throw Failure.invalidArguments }
            let request = try JSONDecoder().decode(Request.self, from: data)
            guard !request.query.isEmpty, request.query.count <= 256, request.expectedFiles > 0,
                  !serving || (request.id?.isEmpty == false) else { throw Failure.invalidArguments }
            let result = try search(request, engine: engine, store: store, path: args[2], reused: completed > 0)
            WorkerMemory.settle()
            FileHandle.standardOutput.write(try JSONEncoder().encode(result))
            if serving { FileHandle.standardOutput.write(Data([10])) }
            completed += 1
        }
    }

    static func nextRequest(serving: Bool, completed: Int) -> Data? {
        if serving { return readLine(strippingNewline: true).map { Data($0.utf8) } }
        return completed == 0 ? FileHandle.standardInput.readDataToEndOfFile() : nil
    }

    static func search(_ request: Request, engine: OmniEngine, store: VectorStore, path: String, reused: Bool) throws -> Response {
        let (corpus, normalized, aliases, settings, admitted) = try prepareCorpus(path)
        // A private snapshot has a complete inventory; empty subroots are intentional.
        var stale = Set<String>()
        store.knownFiles().forEach { path, _ in
            if !admitted.contains(path) { stale.insert(path) }
        }
        if !stale.isEmpty { store.deletePaths(stale) }
        let indexer = Indexer(store: store, embedder: engine)
        indexer.index(roots: [corpus, normalized], settings: settings) { _ in }
        guard store.fileCount == request.expectedFiles else {
            FileHandle.standardError.write(Data("Native index inventory: indexed=\(store.fileCount), expected=\(request.expectedFiles)\n".utf8))
            throw Failure.incompleteIndex
        }
        let vector = engine.embedText(request.query, as: .query)
        let hits = try store.search(vector, topK: 10, textQuery: request.query).map { hit in
            guard hit.kind == "text", hit.locator.hasPrefix("Line "),
                  let line = Int(hit.locator.dropFirst(5)), line > 0 else { throw Failure.invalidLocator }
            return Hit(path: aliases[hit.path] ?? hit.path, score: hit.score, line: line, chunkIndex: hit.chunkIndex, locator: hit.locator)
        }
        return Response(id: request.id ?? "", modelReused: reused, indexedFiles: store.fileCount, hits: hits)
    }

    static func prepareCorpus(_ path: String) throws -> (URL, URL, [String: String], IndexSettings, Set<String>) {
        let corpus = URL(fileURLWithPath: path)
        let normalized = corpus.deletingLastPathComponent().appendingPathComponent("plain-text")
        let fm = FileManager.default
        try fm.createDirectory(at: normalized, withIntermediateDirectories: true)
        var aliases: [String: String] = [:]
        var admitted = Set<String>()
        guard let files = fm.enumerator(at: corpus, includingPropertiesForKeys: [.isRegularFileKey]) else {
            throw Failure.incompleteIndex
        }
        for case let url as URL in files {
            guard try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else { continue }
            if FileExtractor.textExtensions.contains(url.pathExtension.lowercased()) {
                admitted.insert(url.path)
                continue
            }
            let key = SHA256.hash(data: Data(url.path.utf8)).map { String(format: "%02x", $0) }.joined()
            let folder = normalized.appendingPathComponent(key)
            try fm.createDirectory(at: folder, withIntermediateDirectories: true)
            let alias = folder.appendingPathComponent(url.lastPathComponent + ".txt")
            let bytes = try Data(contentsOf: url)
            if (try? Data(contentsOf: alias)) != bytes { try bytes.write(to: alias) }
            aliases[alias.path] = url.path
            admitted.insert(alias.path)
        }
        if let old = fm.enumerator(at: normalized, includingPropertiesForKeys: [.isRegularFileKey]) {
            for case let url as URL in old where aliases[url.path] == nil {
                if try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
                    try fm.removeItem(at: url)
                }
            }
        }
        var settings = IndexSettings(enabledKinds: [.text])
        settings.ignore = OmniIgnore(text: "")
        // Source admission is complete before this process receives its private corpus.
        // Non-plain suffixes are normalized from already verified UTF-8 source bytes.
        // Only normalized plain text may enter the index for these files.
        if !aliases.isEmpty {
            settings.ignore = OmniIgnore(text: aliases.values.map { path in
                path.map { ch in "\\*?[]#!".contains(ch) ? "\\" + String(ch) : String(ch) }.joined()
            }.joined(separator: "\n"))
        }
        return (corpus, normalized, aliases, settings, admitted)
    }

    enum Failure: Error {
        case invalidArguments, incompleteIndex, invalidLocator
    }
}
