import Foundation
import OmniKit

/// Bounds transient inference allocations without putting the loaded model below its working floor.
enum WorkerMemory {
    static let headroom = 1_000_000_000

    static func prepare(modelDirectory: String) throws {
        let weights = URL(fileURLWithPath: modelDirectory).appendingPathComponent("model.safetensors")
        let bytes = try weights.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        omniSetMemoryHeadroom(headroom, residentBytes: bytes)
    }

    static func settle() {
        omniClearGPUCache()
        omniSetMemoryHeadroom(headroom, residentBytes: omniGPUActiveMemory())
    }
}
