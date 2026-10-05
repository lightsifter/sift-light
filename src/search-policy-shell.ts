import { fileURLToPath } from "node:url";
import { Language, Parser, type Node } from "web-tree-sitter";
import {
  classifyCommand,
  executableName,
  type SearchKind,
  type ShellLanguage,
} from "./search-policy-commands.js";
import { isStdinOnlySearchFilter } from "./search-policy-stdin-filter.js";

export const MAX_POLICY_COMMAND_BYTES = 64 * 1024;
const MAX_SHELL_NESTING = 4;
const POWERSHELL_FILE_OBJECT_PRODUCERS = new Set([
  "get-item",
  "gi",
  "get-childitem",
  "gci",
  "dir",
  "ls",
]);
const POWERSHELL_STRING_CONVERTERS = new Set(["out-string", "oss", "convertto-json"]);

export interface ShellSearchMatch {
  kind: SearchKind;
  command: string;
  argv: readonly (string | null)[];
  hasUntranslatedShellSyntax: boolean;
  hasVariableAssignments: boolean;
  hasSyntaxError: boolean;
  commandIndex: number;
  startByte: number;
  endByte: number;
  nestedDepth: number;
  language: ShellLanguage;
}

interface InspectionState {
  nextCommandIndex: number;
}

function decodeBashDoubleQuoted(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      result += character;
      continue;
    }
    const next = value[index + 1];
    if (next === undefined || !["$", "`", '"', "\\", "\n"].includes(next)) {
      result += character;
      continue;
    }
    if (next !== "\n") result += next;
    index += 1;
  }
  return result;
}

function decodePowerShellSingleQuoted(value: string): string | null {
  if (!(value.length >= 2 && value.startsWith("'") && value.endsWith("'"))) return null;
  const body = value.slice(1, -1);
  let result = "";
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character !== "'") {
      result += character;
      continue;
    }
    if (body[index + 1] !== "'") return null;
    result += "'";
    index += 1;
  }
  return result;
}

function literalWord(node: Node, language: ShellLanguage): string | null {
  const text = node.text;
  if (language === "powershell") {
    const singleQuoted = decodePowerShellSingleQuoted(text);
    if (singleQuoted !== null) return singleQuoted;
    if (node.descendantsOfType(["variable", "sub_expression"]).length > 0) return null;
    const quoted = text.length >= 2 && text.startsWith('"') && text.endsWith('"');
    if (!quoted && !["command_name", "generic_token", "command_parameter"].includes(node.type))
      return null;
    const unquoted = quoted ? text.slice(1, -1) : text;
    return unquoted.replace(/`([`"'$])/gu, "$1");
  }
  if (node.type === "raw_string")
    return text.length >= 2 && text.startsWith("'") && text.endsWith("'")
      ? text.slice(1, -1)
      : null;
  if (node.type === "string_content") return decodeBashDoubleQuoted(text);
  if (node.type === "word" || node.type === "number") return text.replace(/\\(.)/gsu, "$1");
  if (["command_name", "concatenation", "string"].includes(node.type)) {
    if (node.type === "string" && !(text.length >= 2 && text.startsWith('"') && text.endsWith('"')))
      return null;
    let result = "";
    for (const child of node.namedChildren) {
      if (!child) continue;
      const part = literalWord(child, language);
      if (part === null) return null;
      result += part;
    }
    return result;
  }
  return null;
}

function commandWordNodes(node: Node, language: ShellLanguage): Node[] {
  const name = node.childForFieldName(language === "bash" ? "name" : "command_name");
  if (!name) return [];
  const args =
    language === "bash"
      ? node.childrenForFieldName("argument").filter((child): child is Node => child !== null)
      : (node
          .childForFieldName("command_elements")
          ?.namedChildren.filter(
            (child): child is Node =>
              child !== null && !["command_argument_sep", "redirection"].includes(child.type),
          ) ?? []);
  return [name, ...args];
}

function commandWords(node: Node, language: ShellLanguage): Array<string | null> {
  return commandWordNodes(node, language).map((word) => literalWord(word, language));
}

function hasBashWordExpansion(text: string): boolean {
  if (text.startsWith("~") || text.startsWith("=")) return true;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
    } else if ("*?[]{}".includes(text[index] ?? "")) {
      return true;
    }
  }
  return false;
}

function hasUntranslatedShellSyntax(node: Node, language: ShellLanguage): boolean {
  const text = node.text;
  if (language === "powershell") {
    if (text.length >= 2 && text.startsWith("'") && text.endsWith("'"))
      return decodePowerShellSingleQuoted(text) === null;
    const quoted = text.length >= 2 && text.startsWith('"') && text.endsWith('"');
    const quotedBody = quoted ? text.slice(1, -1) : "";
    return (
      text.includes("`") ||
      quotedBody.includes('"') ||
      (!quoted && /['"]/u.test(text)) ||
      (!quoted && text.startsWith("~"))
    );
  }
  if (["raw_string", "string", "string_content"].includes(node.type)) return false;
  if (["word", "number", "command_name"].includes(node.type)) return hasBashWordExpansion(text);
  if (node.type === "concatenation")
    return node.namedChildren.some(
      (child) => child !== null && hasUntranslatedShellSyntax(child, language),
    );
  return false;
}

function hasInputRedirectNodes(owner: Node): boolean {
  return owner
    .descendantsOfType(["file_redirect", "herestring_redirect", "heredoc_redirect"])
    .some((redirect) => redirect !== null && /^(?:\d+)?</u.test(redirect.text));
}

function hasInputRedirect(node: Node): boolean {
  if (hasInputRedirectNodes(node)) return true;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type !== "redirected_statement") continue;
    const body = parent.childForFieldName("body");
    const last =
      body?.descendantsOfType("command").at(-1) ?? (body?.type === "command" ? body : undefined);
    if (
      last?.startIndex === node.startIndex &&
      last.endIndex === node.endIndex &&
      parent
        .childrenForFieldName("redirect")
        .some((redirect) => redirect !== null && hasInputRedirectNodes(redirect))
    )
      return true;
  }
  return false;
}

function isSafePipelineFilter(
  node: Node,
  language: ShellLanguage,
  words: Array<string | null>,
): boolean {
  const wordNodes = commandWordNodes(node, language);
  if (
    !isStdinOnlySearchFilter(
      words,
      language,
      wordNodes.map((word) => word.type === "command_parameter"),
    )
  )
    return false;
  if (wordNodes.some((word) => hasUntranslatedShellSyntax(word, language))) return false;
  if (hasInputRedirect(node)) return false;
  const pipeline = node.parent;
  if (!pipeline || !["pipeline", "pipeline_chain"].includes(pipeline.type)) return false;
  const stages = pipeline.namedChildren.filter((child): child is Node => child !== null);
  const position = stages.findIndex(
    (stage) => stage.startIndex <= node.startIndex && stage.endIndex >= node.endIndex,
  );
  if (position < 1) return false;
  let fileObjectFlow = false;
  for (const [index, stage] of stages.entries()) {
    if (index === position) continue;
    const commands = stage.descendantsOfType("command");
    for (const candidate of commands) {
      if (candidate === null) continue;
      const candidateWords = commandWords(candidate, language);
      const decision = classifyCommand(candidateWords, language);
      if (decision.kind || decision.nested) return false;
      if (language !== "powershell" || index > position) continue;
      const executable = candidateWords[0];
      if (executable === null || executable === undefined) continue;
      const name = executableName(executable).toLowerCase();
      if (POWERSHELL_FILE_OBJECT_PRODUCERS.has(name)) fileObjectFlow = true;
    }
    if (language === "powershell" && index < position && stage.type === "command") {
      const executable = commandWords(stage, language)[0];
      if (
        executable !== null &&
        executable !== undefined &&
        POWERSHELL_STRING_CONVERTERS.has(executableName(executable).toLowerCase())
      )
        fileObjectFlow = false;
    }
  }
  return !fileObjectFlow;
}

/** WASM grammars are shipped with the hook; parsing never reads shell scripts or executes code. */
export class ShellSearchPolicy {
  readonly #assets: URL;
  #initialization: Promise<void> | undefined;
  readonly #languages = new Map<ShellLanguage, Promise<Language>>();

  constructor(assets: URL) {
    this.#assets = assets;
  }

  async inspect(command: string, language: ShellLanguage): Promise<ShellSearchMatch | undefined> {
    if (Buffer.byteLength(command, "utf8") > MAX_POLICY_COMMAND_BYTES)
      throw new Error("Search policy command exceeds 64 KiB; split the shell request");
    this.#initialization ??= Parser.init({
      locateFile: () => fileURLToPath(new URL("tree-sitter.wasm", this.#assets)),
    });
    await this.#initialization;
    // Both grammars are needed for literal bash -c / pwsh -Command wrappers.
    for (const shell of ["bash", "powershell"] as const) {
      if (!this.#languages.has(shell))
        this.#languages.set(
          shell,
          Language.load(fileURLToPath(new URL(`tree-sitter-${shell}.wasm`, this.#assets))),
        );
    }
    const [bash, powershell] = await Promise.all([
      this.#languages.get("bash"),
      this.#languages.get("powershell"),
    ]);
    if (!bash || !powershell) throw new Error("Search policy grammar initialization failed");
    return this.#inspect(command, language, { bash, powershell }, 0, { nextCommandIndex: 1 });
  }

  #inspect(
    command: string,
    language: ShellLanguage,
    grammars: Record<ShellLanguage, Language>,
    depth: number,
    state: InspectionState,
  ): ShellSearchMatch | undefined {
    if (depth > MAX_SHELL_NESTING)
      throw new Error("Search policy shell nesting exceeds 4 levels; simplify the command");
    const parser = new Parser();
    try {
      parser.setLanguage(grammars[language]);
      const deadline = performance.now() + 100;
      const tree = parser.parse(command, null, {
        progressCallback: () => performance.now() > deadline,
      });
      if (!tree)
        throw new Error("Search policy parsing exceeded its time budget; simplify the command");
      try {
        const hasSyntaxError = tree.rootNode.hasError;
        const commands = tree.rootNode.descendantsOfType("command");
        for (const node of commands) {
          if (!node) continue;
          const commandIndex = state.nextCommandIndex;
          state.nextCommandIndex += 1;
          const words = commandWords(node, language);
          const decision = classifyCommand(words, language);
          if (
            decision.kind &&
            !(decision.kind === "content" && isSafePipelineFilter(node, language, words))
          )
            return {
              kind: decision.kind,
              command: decision.command ?? "search command",
              argv: words,
              hasUntranslatedShellSyntax:
                node.descendantsOfType("redirection").length > 0 ||
                commandWordNodes(node, language).some((word) =>
                  hasUntranslatedShellSyntax(word, language),
                ),
              hasVariableAssignments:
                language === "bash" && node.descendantsOfType("variable_assignment").length > 0,
              hasSyntaxError,
              commandIndex,
              startByte: node.startIndex,
              endByte: node.endIndex,
              nestedDepth: depth,
              language,
            };
          if (decision.nested) {
            const nested = this.#inspect(
              decision.nested.command,
              decision.nested.language,
              grammars,
              depth + 1,
              state,
            );
            if (nested) return nested;
          }
        }
        // Tree-sitter's Bash grammar deliberately does not implement every zsh extension.
        // Error recovery still exposes executable-position `command` nodes, which are the
        // policy's authority. An error in an argument (for example `${(P)name}`) is not
        // evidence of a search and must not turn an otherwise ordinary command into a denial.
        return undefined;
      } finally {
        tree.delete();
      }
    } finally {
      parser.delete();
    }
  }
}
