import type { SourceDocument } from "./source-document.js";
import type { SyntaxAnalysis, SyntaxRole } from "./syntax-types.js";

/**
 * Bounded lexical role scanner for Python.
 *
 * It separates comments, string literals and code exactly, and marks `def`/`class`
 * names, import statements and call-shaped callees. It does not parse Python:
 * comments, strings and code are lexical facts ("syntax" certainty); a call is a
 * name followed by `(` in code and therefore stays a "candidate". Offsets are
 * UTF-16 indices into `document.text`, like every other role provider.
 */

const KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "case",
  "del",
  "elif",
  "else",
  "except",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "match",
  "nonlocal",
  "not",
  "or",
  "raise",
  "return",
  "while",
  "with",
  "yield",
]);
const STRING_PREFIX = /^(?:[rRbBuUfF]|[rR][bBfF]|[bBfF][rR])?$/u;
const IDENTIFIER_START = /[\p{ID_Start}_]/u;
const IDENTIFIER_PART = /[\p{ID_Continue}]/u;

interface Span {
  start: number;
  end: number;
}

interface Lexed {
  comments: Span[];
  strings: Span[];
  /** `true` at each UTF-16 index that belongs to code (outside comments/strings). */
  code: Uint8Array;
}

function lex(text: string): Lexed {
  const comments: Span[] = [];
  const strings: Span[] = [];
  const code = new Uint8Array(text.length).fill(1);
  const mark = (start: number, end: number): void => {
    code.fill(0, start, end);
  };
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === "#") {
      const newline = text.indexOf("\n", index);
      const end = newline < 0 ? text.length : newline;
      comments.push({ start: index, end });
      mark(index, end);
      index = end;
      continue;
    }
    if (character !== "'" && character !== '"') {
      index += 1;
      continue;
    }
    // A string prefix (r, b, f, u and their pairs) is part of the literal.
    let prefixStart = index;
    while (prefixStart > 0 && /[rRbBuUfF]/u.test(text[prefixStart - 1] ?? "")) prefixStart -= 1;
    const prefix = text.slice(prefixStart, index);
    const beforePrefix = text[prefixStart - 1] ?? "";
    const start =
      STRING_PREFIX.test(prefix) && !IDENTIFIER_PART.test(beforePrefix) ? prefixStart : index;
    const triple = text.slice(index, index + 3) === character.repeat(3);
    const delimiter = triple ? character.repeat(3) : character;
    let cursor = index + delimiter.length;
    let end = text.length;
    while (cursor < text.length) {
      const current = text[cursor];
      // A backslash always protects the next character from ending the literal,
      // including in raw strings (where the backslash itself is kept).
      if (current === "\\") {
        cursor += 2;
        continue;
      }
      if (!triple && current === "\n") {
        end = cursor;
        break;
      }
      if (text.startsWith(delimiter, cursor)) {
        end = cursor + delimiter.length;
        break;
      }
      cursor += 1;
    }
    strings.push({ start, end });
    mark(start, end);
    index = end;
  }
  return { comments, strings, code };
}

function codeRanges(code: Uint8Array): Span[] {
  const ranges: Span[] = [];
  let start = -1;
  for (let index = 0; index <= code.length; index += 1) {
    const inCode = index < code.length && code[index] === 1;
    if (inCode && start < 0) start = index;
    else if (!inCode && start >= 0) {
      ranges.push({ start, end: index });
      start = -1;
    }
  }
  return ranges;
}

function identifierEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && IDENTIFIER_PART.test(text[end] ?? "")) end += 1;
  return end;
}

function skipSpaces(text: string, index: number, code: Uint8Array): number {
  let cursor = index;
  while (cursor < text.length && code[cursor] === 1 && /[ \t]/u.test(text[cursor] ?? ""))
    cursor += 1;
  return cursor;
}

/** Index after the statement starting at `start`, following parenthesized continuation lines. */
function statementEnd(text: string, start: number, code: Uint8Array): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (code[index] !== 1) continue;
    const character = text[index];
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}")
      depth = Math.max(0, depth - 1);
    else if (character === "\\" && text[index + 1] === "\n") index += 1;
    else if (character === "\n" && depth === 0) return index;
  }
  return text.length;
}

export function pythonRoleAnalysis(document: SourceDocument): SyntaxAnalysis {
  const text = document.text;
  const { comments, strings, code } = lex(text);
  const roles: SyntaxRole[] = [];
  const push = (
    start: number,
    end: number,
    role: SyntaxRole["role"],
    certainty: SyntaxRole["certainty"],
    subkind?: string,
  ): void => {
    if (start < end)
      roles.push({ start, end, role, certainty, node: 0, ...(subkind ? { subkind } : {}) });
  };
  for (const span of comments) push(span.start, span.end, "comment", "syntax");
  for (const span of strings) push(span.start, span.end, "string", "syntax");
  for (const span of codeRanges(code)) push(span.start, span.end, "code", "syntax");

  let index = 0;
  let lineStart = true;
  while (index < text.length) {
    const character = text[index] ?? "";
    if (character === "\n") {
      lineStart = true;
      index += 1;
      continue;
    }
    if (code[index] !== 1 || !IDENTIFIER_START.test(character)) {
      if (!/[ \t]/u.test(character)) lineStart = false;
      index += 1;
      continue;
    }
    const previous = text[index - 1] ?? "";
    if (IDENTIFIER_PART.test(previous)) {
      index += 1;
      continue;
    }
    const end = identifierEnd(text, index);
    const word = text.slice(index, end);
    const atStatementStart = lineStart;
    lineStart = false;
    if (atStatementStart && (word === "import" || word === "from")) {
      const statement = statementEnd(text, index, code);
      const body = text.slice(index, statement);
      if (word === "import" || /\bimport\b/u.test(body)) {
        push(index, statement, "import", "syntax", word === "from" ? "from-import" : "import");
        index = statement;
        continue;
      }
    }
    if (word === "def" || word === "class") {
      const nameStart = skipSpaces(text, end, code);
      if (IDENTIFIER_START.test(text[nameStart] ?? "")) {
        const nameEnd = identifierEnd(text, nameStart);
        push(nameStart, nameEnd, "declaration", "syntax", word === "def" ? "function" : "class");
        index = nameEnd;
        continue;
      }
    }
    // Attribute chains such as `client.fetch(` are one callee.
    let chainEnd = end;
    while (text[chainEnd] === "." && IDENTIFIER_START.test(text[chainEnd + 1] ?? "")) {
      chainEnd = identifierEnd(text, chainEnd + 1);
    }
    const open = skipSpaces(text, chainEnd, code);
    const lastSegment = text.slice(text.lastIndexOf(".", chainEnd - 1) + 1, chainEnd);
    const before = text.slice(Math.max(0, index - 4), index);
    if (
      text[open] === "(" &&
      code[open] === 1 &&
      !KEYWORDS.has(word) &&
      !KEYWORDS.has(lastSegment) &&
      !/\bdef\s+$|\bclass\s+$/u.test(before)
    ) {
      push(index, open + 1, "call", "candidate", "lexical-call");
    }
    index = chainEnd;
  }
  roles.sort((a, b) => a.start - b.start || a.end - b.end || a.role.localeCompare(b.role));
  return {
    status: "ok",
    nodes: [],
    children: [],
    symbols: [],
    roles,
    diagnostics: [],
    limited: false,
  };
}
