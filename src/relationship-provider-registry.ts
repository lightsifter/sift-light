import { goSemanticProvider } from "./go-semantic-provider.js";
import {
  DEFAULT_LANGUAGE_CAPABILITIES,
  descriptorForPath,
} from "./language-capability-definitions.js";
import { SourceAccess, type SyntaxQueue } from "./source-access.js";
import {
  createTypeScriptRelationshipProvider,
  TYPESCRIPT_PROVIDER_ID,
} from "./typescript-relationship-provider.js";
import {
  SWIFT_SEMANTIC_PROVIDER_ID,
  swiftSemanticProvider,
} from "./swift-relationship-provider.js";
import {
  PYTHON_SEMANTIC_PROVIDER_ID,
  pythonSemanticProvider,
} from "./python-relationship-provider.js";
import type {
  RelationshipProvider,
  RelationshipOperation,
  RelationshipProviderOptions,
  RelationshipView,
} from "./relationship-types.js";

export interface RelationshipProviderRegistration {
  readonly providerId: string;
  readonly languages: readonly string[];
  readonly operations: readonly RelationshipOperation[];
  readonly limitsForOperation?: (
    operation: RelationshipOperation,
  ) => Readonly<Record<string, number>>;
  readonly supports: (path: string) => boolean;
  readonly open: (options: RelationshipProviderRegistrationOptions) => Promise<RelationshipView>;
}

export interface RelationshipProviderRegistrationOptions extends Omit<
  RelationshipProviderOptions,
  "source"
> {
  readonly queue: SyntaxQueue;
  readonly maxFiles: number;
}

function sourceProvider(
  provider: RelationshipProvider,
  queue: SyntaxQueue,
  languages: readonly string[],
  capabilityProvider: string,
  supports: (path: string) => boolean,
  limitsForOperation?: RelationshipProviderRegistration["limitsForOperation"],
): RelationshipProviderRegistration {
  return {
    providerId: provider.providerId,
    languages,
    operations: relationshipOperations(capabilityProvider),
    ...(limitsForOperation ? { limitsForOperation } : {}),
    supports,
    open: async (options) => {
      const source = new SourceAccess(options.cwd, queue, options.signal, {
        maxFiles: options.maxFiles,
      });
      return provider.open({
        ...options,
        source,
        limits: { ...options.limits, maxFiles: options.maxFiles },
      });
    },
  };
}

function relationshipOperations(provider: string): readonly RelationshipOperation[] {
  const operationNames = new Set<string>([
    "definitions",
    "references",
    "implementations",
    "callers",
    "callees",
  ]);
  const isOperation = (value: string): value is RelationshipOperation => operationNames.has(value);
  return [
    ...new Set(
      DEFAULT_LANGUAGE_CAPABILITIES.flatMap((descriptor) =>
        descriptor.capabilities
          .filter((capability) => capability.provider === provider)
          .flatMap(
            (capability) =>
              capability.relationshipOperations ??
              (isOperation(capability.name) ? [capability.name] : []),
          ),
      ),
    ),
  ];
}

function relationshipLanguages(provider: string): readonly string[] {
  return DEFAULT_LANGUAGE_CAPABILITIES.filter((descriptor) =>
    descriptor.capabilities.some((capability) => capability.provider === provider),
  ).map((descriptor) => descriptor.language);
}

/**
 * Provider selection is a registry lookup.  The registry owns no live provider
 * state and starts no process until its selected registration is opened.  A
 * language component can add a registration without changing RelationshipService.
 */
export function createRelationshipProviderRegistry(
  queue: SyntaxQueue,
): readonly RelationshipProviderRegistration[] {
  const goLanguages = relationshipLanguages("gopls");
  const swiftLanguages = relationshipLanguages(SWIFT_SEMANTIC_PROVIDER_ID);
  const pythonLanguages = relationshipLanguages(PYTHON_SEMANTIC_PROVIDER_ID);
  return [
    sourceProvider(goSemanticProvider, queue, goLanguages, "gopls", (path) =>
      goLanguages.includes(descriptorForPath(DEFAULT_LANGUAGE_CAPABILITIES, path)?.language ?? ""),
    ),
    createTypeScriptRelationshipRegistration(queue),
    sourceProvider(
      swiftSemanticProvider,
      queue,
      swiftLanguages,
      SWIFT_SEMANTIC_PROVIDER_ID,
      (path) =>
        swiftLanguages.includes(
          descriptorForPath(DEFAULT_LANGUAGE_CAPABILITIES, path)?.language ?? "",
        ),
      (operation) =>
        ["references", "implementations", "callers", "callees"].includes(operation)
          ? { swiftIndex: 1 }
          : {},
    ),
    sourceProvider(
      pythonSemanticProvider,
      queue,
      pythonLanguages,
      PYTHON_SEMANTIC_PROVIDER_ID,
      (path) =>
        pythonLanguages.includes(
          descriptorForPath(DEFAULT_LANGUAGE_CAPABILITIES, path)?.language ?? "",
        ),
    ),
  ];
}

/** Build a TypeScript registration without comparing provider object identity. */
export function createTypeScriptRelationshipRegistration(
  queue: SyntaxQueue,
): RelationshipProviderRegistration {
  const languages = relationshipLanguages("TypeScript language service relationship provider");
  return {
    providerId: TYPESCRIPT_PROVIDER_ID,
    languages,
    operations: relationshipOperations("TypeScript language service relationship provider"),
    supports: (path) =>
      languages.includes(descriptorForPath(DEFAULT_LANGUAGE_CAPABILITIES, path)?.language ?? ""),
    open: async (options) => {
      const source = new SourceAccess(options.cwd, queue, options.signal, {
        maxFiles: options.maxFiles,
      });
      return createTypeScriptRelationshipProvider(source).open({
        ...options,
        source,
        limits: { ...options.limits, maxFiles: options.maxFiles },
      });
    },
  };
}
