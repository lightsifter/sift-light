import { resolve } from "node:path";
import { listWorkspaceFiles } from "./workspace-files.js";
import {
  DEFAULT_LANGUAGE_CAPABILITIES,
  DEFAULT_NEUTRAL_CAPABILITIES,
  descriptorForPath,
  type CapabilityAvailability,
  type LanguageCapability,
  type LanguageCapabilityDescriptor,
  type LanguageCapabilitySpec,
  type LanguageId,
  type NeutralCapabilitySpec,
} from "./language-capability-definitions.js";

export type {
  CapabilityAvailability,
  LanguageCapability,
  LanguageCapabilityDescriptor,
  LanguageCapabilitySpec,
  LanguageId,
  NeutralCapabilitySpec,
} from "./language-capability-definitions.js";
export {
  DEFAULT_LANGUAGE_CAPABILITIES,
  DEFAULT_NEUTRAL_CAPABILITIES,
} from "./language-capability-definitions.js";

export interface LanguageCapabilityEntry {
  readonly language: LanguageId;
  readonly files: number;
  readonly extensions: readonly string[];
  /** Stable ids are resolved through inventory.capabilityDefinitions. */
  readonly capabilities: readonly { id: string; name: LanguageCapability }[];
  readonly availability: CapabilityAvailability;
  /** Capability discovery never probes external tools or project indexes. */
  readonly readiness: "not-probed";
  readonly evidence: "inventory" | "target-extension";
}

export interface LanguageCapabilityRequest {
  readonly cwd: string;
  readonly path?: string;
  readonly glob?: readonly string[];
  readonly exclude?: readonly string[];
  readonly hidden?: boolean;
  readonly signal?: AbortSignal;
}

export interface LanguageCapabilityInventory {
  /** Root of the bounded names-only inventory, not a parsed project root. */
  readonly root: string;
  readonly path?: string;
  readonly partial: boolean;
  readonly reasons: readonly string[];
  readonly languages: readonly LanguageCapabilityEntry[];
  /** Deduplicated implementation facts, referenced by capability id above. */
  readonly capabilityDefinitions: readonly LanguageCapabilitySpec[];
  readonly neutral: readonly NeutralCapabilitySpec[];
}

function normalizeLists(values: readonly string[] | undefined): string[] {
  return values === undefined ? [] : [...values];
}

function languageAvailability(
  capabilities: readonly LanguageCapabilitySpec[],
): CapabilityAvailability {
  if (capabilities.length === 0) return "unavailable";
  if (capabilities.some((capability) => capability.availability === "conditional"))
    return "conditional";
  return "implemented";
}

/**
 * Lightweight project capability discovery. It enumerates names only and
 * never opens a parser, compiler, model worker or language server.
 */
export class LanguageCapabilityCatalog {
  readonly #descriptors: readonly LanguageCapabilityDescriptor[];
  readonly #neutral: readonly NeutralCapabilitySpec[];

  constructor(
    descriptors: readonly LanguageCapabilityDescriptor[] = DEFAULT_LANGUAGE_CAPABILITIES,
    neutral: readonly NeutralCapabilitySpec[] = DEFAULT_NEUTRAL_CAPABILITIES,
  ) {
    this.#descriptors = [...descriptors];
    this.#neutral = [...neutral];
  }

  descriptor(language: LanguageId): LanguageCapabilityDescriptor | undefined {
    return this.#descriptors.find((item) => item.language === language);
  }

  descriptorForPath(path: string): LanguageCapabilityDescriptor | undefined {
    return descriptorForPath(this.#descriptors, path);
  }

  async inspect(request: LanguageCapabilityRequest): Promise<LanguageCapabilityInventory> {
    const path = request.path?.replace(/^@/, "");
    const files = await listWorkspaceFiles(request.cwd, request.signal, {
      ...(path ? { path } : {}),
      glob: normalizeLists(request.glob),
      exclude: normalizeLists(request.exclude),
      hidden: request.hidden ?? true,
    });
    const counts = new Map<LanguageId, number>();
    for (const file of files.paths) {
      const descriptor = this.descriptorForPath(file);
      if (descriptor) counts.set(descriptor.language, (counts.get(descriptor.language) ?? 0) + 1);
    }
    const entries = [...counts.entries()].flatMap(([language, count]) => {
      const descriptor = this.descriptor(language);
      if (!descriptor) return [];
      return [this.#entry(descriptor, count, "inventory")];
    });
    const target = path ? this.descriptorForPath(path) : undefined;
    if (target && !counts.has(target.language))
      entries.push(this.#entry(target, 0, "target-extension"));
    entries.sort((left, right) => left.language.localeCompare(right.language));
    const capabilityDefinitions = [
      ...new Map(
        entries
          .flatMap((entry) => this.descriptor(entry.language)?.capabilities ?? [])
          .map((capability) => [capability.id, capability] as const),
      ).values(),
    ];
    return {
      root: resolve(request.cwd),
      ...(path ? { path } : {}),
      partial: files.partial,
      reasons: files.reasons,
      languages: entries,
      capabilityDefinitions,
      neutral: this.#neutral,
    };
  }

  #entry(
    descriptor: LanguageCapabilityDescriptor,
    files: number,
    evidence: LanguageCapabilityEntry["evidence"],
  ): LanguageCapabilityEntry {
    return {
      language: descriptor.language,
      files,
      extensions: descriptor.extensions,
      capabilities: descriptor.capabilities.map(({ id, name }) => ({ id, name })),
      availability: languageAvailability(descriptor.capabilities),
      readiness: "not-probed",
      evidence,
    };
  }
}

export function languageCapabilityForPath(path: string): LanguageCapabilityDescriptor | undefined {
  return descriptorForPath(DEFAULT_LANGUAGE_CAPABILITIES, path);
}
