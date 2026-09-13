import { extname } from "node:path";

export type LanguageId = "javascript" | "typescript" | "tsx" | "go" | "python" | "swift";

export type LanguageCapability = "outline" | "structure" | "roles" | "imports" | "tests";

export type CapabilityEvidence = "text" | "syntax" | "compiler" | "external" | "model";
export type CapabilityAvailability = "implemented" | "conditional" | "unavailable";
export type CapabilityProviderKind = "builtin" | "external" | "model";

/** One capability declaration is the source of provider, evidence and loading facts. */
export interface LanguageCapabilitySpec {
  readonly id: string;
  readonly name: LanguageCapability;
  readonly provider: string;
  readonly providerKind: CapabilityProviderKind;
  readonly evidence: CapabilityEvidence;
  readonly availability: CapabilityAvailability;
  /** Runtime parser/compiler/model resource activation, not JavaScript module import timing. */
  readonly load: "lazy";
  readonly prerequisites?: readonly string[];
}

export interface LanguageCapabilityDescriptor {
  readonly language: LanguageId;
  readonly extensions: readonly string[];
  readonly capabilities: readonly LanguageCapabilitySpec[];
}

export type NeutralCapabilityName = "content" | "files" | "concept" | "hybrid";

export interface NeutralCapabilitySpec {
  readonly id: string;
  readonly name: NeutralCapabilityName;
  readonly provider: string;
  readonly providerKind: CapabilityProviderKind;
  readonly evidence: CapabilityEvidence;
  readonly availability: CapabilityAvailability;
  readonly load: "none" | "lazy";
  readonly prerequisites?: readonly string[];
}

const TYPESCRIPT_LANGUAGE_CAPABILITIES: readonly LanguageCapabilitySpec[] = [
  {
    id: "ast-grep.outline",
    name: "outline",
    provider: "ast-grep",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy",
  },
  {
    id: "ast-grep.structure",
    name: "structure",
    provider: "ast-grep",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy",
  },
  {
    id: "ast-grep.roles",
    name: "roles",
    provider: "ast-grep",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy",
  },
  {
    id: "static-navigation.imports",
    name: "imports",
    provider: "bounded static module resolver",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy",
  },
  {
    id: "static-navigation.tests",
    name: "tests",
    provider: "bounded static module resolver",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy",
  },
];

const GO_LANGUAGE_CAPABILITIES: readonly LanguageCapabilitySpec[] = [
  {
    id: "ast-grep-go.structure",
    name: "structure",
    provider: "ast-grep lang-go",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy",
  },
  {
    id: "ast-grep-go.roles",
    name: "roles",
    provider: "ast-grep lang-go",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy",
  },
];

const PYTHON_LANGUAGE_CAPABILITIES: readonly LanguageCapabilitySpec[] = [
  {
    id: "python-outline.outline",
    name: "outline",
    provider: "bounded Python outline parser",
    providerKind: "builtin",
    evidence: "syntax",
    availability: "implemented",
    load: "lazy",
  },
];

export const DEFAULT_LANGUAGE_CAPABILITIES: readonly LanguageCapabilityDescriptor[] = [
  {
    language: "javascript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    capabilities: TYPESCRIPT_LANGUAGE_CAPABILITIES,
  },
  {
    language: "typescript",
    extensions: [".ts", ".mts", ".cts"],
    capabilities: TYPESCRIPT_LANGUAGE_CAPABILITIES,
  },
  {
    language: "tsx",
    extensions: [".tsx"],
    capabilities: TYPESCRIPT_LANGUAGE_CAPABILITIES,
  },
  { language: "go", extensions: [".go"], capabilities: GO_LANGUAGE_CAPABILITIES },
  { language: "python", extensions: [".py"], capabilities: PYTHON_LANGUAGE_CAPABILITIES },
  { language: "swift", extensions: [".swift"], capabilities: [] },
];

export const DEFAULT_NEUTRAL_CAPABILITIES: readonly NeutralCapabilitySpec[] = [
  {
    id: "neutral.content",
    name: "content",
    provider: "ripgrep",
    providerKind: "builtin",
    evidence: "text",
    availability: "implemented",
    load: "none",
  },
  {
    id: "neutral.files",
    name: "files",
    provider: "ripgrep --files",
    providerKind: "builtin",
    evidence: "text",
    availability: "implemented",
    load: "none",
  },
  {
    id: "neutral.concept",
    name: "concept",
    provider: "local multilingual-e5 model",
    providerKind: "model",
    evidence: "model",
    availability: "conditional",
    load: "lazy",
    prerequisites: ["verified local model assets"],
  },
  {
    id: "neutral.hybrid",
    name: "hybrid",
    provider: "ripgrep + local multilingual-e5 model",
    providerKind: "model",
    evidence: "model",
    availability: "conditional",
    load: "lazy",
    prerequisites: ["verified local model assets"],
  },
];

export function descriptorForPath(
  descriptors: readonly LanguageCapabilityDescriptor[],
  path: string,
): LanguageCapabilityDescriptor | undefined {
  const extension = extname(path).toLowerCase();
  return descriptors.find((item) => item.extensions.includes(extension));
}

export function languageForPath(
  descriptors: readonly LanguageCapabilityDescriptor[],
  path: string,
): LanguageId | undefined {
  return descriptorForPath(descriptors, path)?.language;
}

export function outlineExtension(path: string): string | undefined {
  const extension = extname(path).toLowerCase();
  return extension || undefined;
}
