import type { AnalysisResultSet } from "./analysis-types.js";
import {
  DEFAULT_LANGUAGE_CAPABILITIES,
  type LanguageCapabilitySpec,
  descriptorForPath,
} from "./language-capability-definitions.js";
import type {
  RelationshipProviderRegistration,
  RelationshipProviderRegistrationOptions,
} from "./relationship-provider-registry.js";
import type { RelationshipOperation } from "./relationship-types.js";
import type { RelationshipScopeResolution } from "./relationship-service.js";
import { isSemanticMode, SEMANTIC_MODES, type SemanticMode } from "./semantic-protocol.js";
import { navigateSemantics } from "./semantic-navigation.js";
import type { SourceAccess } from "./source-access.js";
import type { SignalGrepInput } from "./service.js";
import {
  hasDeclaredOutlineProvider,
  navigateOutline as navigateOutlineAdapter,
  navigateRelationship as navigateRelationshipAdapter,
  outlineProviderSupports,
} from "./semantic-navigation-adapter.js";

export interface SemanticProviderRegistration {
  readonly providerId: string;
  readonly modes: readonly SemanticMode[];
  readonly supports: (path: string, mode: SemanticMode) => boolean;
  readonly navigate: (input: SignalGrepInput, access: SourceAccess) => Promise<AnalysisResultSet>;
}

export interface SemanticProviderRegistryOptions {
  readonly relationships: readonly RelationshipProviderRegistration[];
  readonly queue: RelationshipProviderRegistrationOptions["queue"];
  readonly resolveScope: (
    cwd: string,
    target: string,
    input: SignalGrepInput,
    signal?: AbortSignal,
  ) => Promise<RelationshipScopeResolution>;
}

export interface OutlineProviderRegistration {
  readonly providerId: string;
  readonly supports: (path: string) => boolean;
  readonly navigate: (input: SignalGrepInput, access: SourceAccess) => Promise<AnalysisResultSet>;
}

const RELATIONSHIP_OPERATIONS = [
  "definitions",
  "references",
  "implementations",
  "callers",
  "callees",
] as const satisfies readonly RelationshipOperation[];

function relationshipMode(mode: SemanticMode): mode is RelationshipOperation {
  return RELATIONSHIP_OPERATIONS.some((candidate) => candidate === mode);
}

function descriptorSupports(path: string, mode: SemanticMode, provider: string): boolean {
  return Boolean(
    descriptorForPath(DEFAULT_LANGUAGE_CAPABILITIES, path)?.capabilities.some(
      (capability) =>
        capability.name === mode &&
        capability.provider === provider &&
        capability.availability !== "unavailable",
    ),
  );
}

function declaredModes(provider: string): readonly SemanticMode[] {
  const isSemanticCapability = (
    capability: LanguageCapabilitySpec,
  ): capability is LanguageCapabilitySpec & { readonly name: SemanticMode } =>
    capability.provider === provider && SEMANTIC_MODES.some((mode) => mode === capability.name);
  return [
    ...new Set(
      DEFAULT_LANGUAGE_CAPABILITIES.flatMap((descriptor) =>
        descriptor.capabilities.filter(isSemanticCapability).map((capability) => capability.name),
      ),
    ),
  ];
}

export function createSemanticProviderRegistry(
  options: SemanticProviderRegistryOptions,
): readonly SemanticProviderRegistration[] {
  const typescriptProvider = "TypeScript language service relationship provider";
  const typescriptModes = declaredModes(typescriptProvider);
  const registrations: SemanticProviderRegistration[] = [
    {
      providerId: "typescript",
      modes: typescriptModes,
      supports: (path, mode) => descriptorSupports(path, mode, typescriptProvider),
      navigate: (input, access) => navigateSemantics(input, access),
    },
  ];
  for (const relationship of options.relationships) {
    if (!relationship.operations.length) continue;
    const modes = declaredModes(relationship.providerId);
    if (!modes.length) continue;
    registrations.push({
      providerId: relationship.providerId,
      modes,
      supports: (path, mode) =>
        relationshipMode(mode) &&
        relationship.operations.includes(mode) &&
        descriptorSupports(path, mode, relationship.providerId),
      navigate: (input, access) =>
        navigateRelationshipAdapter(
          relationship,
          input,
          access,
          options.resolveScope,
          options.queue,
        ),
    });
  }
  return registrations;
}

export function createOutlineProviderRegistry(
  options: SemanticProviderRegistryOptions,
): readonly OutlineProviderRegistration[] {
  return options.relationships.flatMap((relationship) => {
    if (!hasDeclaredOutlineProvider(relationship)) return [];
    return [
      {
        providerId: relationship.providerId,
        supports: (path: string) => outlineProviderSupports(relationship, path),
        navigate: (input: SignalGrepInput, access: SourceAccess) =>
          navigateOutlineAdapter(relationship, input, access, options.resolveScope, options.queue),
      },
    ];
  });
}

export function findOutlineProvider(
  registrations: readonly OutlineProviderRegistration[],
  path: string,
): OutlineProviderRegistration | undefined {
  return registrations.find((registration) => registration.supports(path));
}

export function findSemanticProvider(
  registrations: readonly SemanticProviderRegistration[],
  input: SignalGrepInput,
): SemanticProviderRegistration | undefined {
  if (!input.path || !isSemanticMode(input.mode)) return undefined;
  const mode = input.mode;
  return registrations.find((registration) => registration.supports(input.path!, mode));
}
