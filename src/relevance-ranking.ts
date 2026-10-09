import type { AnalysisItem } from "./analysis-types.js";

const words = new Intl.Segmenter("zh", { granularity: "word" });
const stopWords = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "of",
  "to",
  "in",
  "and",
  "or",
  "for",
  "how",
  "where",
  "what",
  "的",
  "了",
  "是",
  "在",
  "和",
  "如何",
  "哪里",
  "什么",
]);

/** Camel-case identifiers split into component words; Han compounds also have bigrams. */
export function retrievalTokens(text: string): string[] {
  const expanded = text
    .replaceAll(/([a-z\d])([A-Z])/gu, "$1 $2")
    .normalize("NFKC")
    .toLowerCase();
  const tokens: string[] = [];
  for (const part of words.segment(expanded)) {
    if (!part.isWordLike || stopWords.has(part.segment)) continue;
    tokens.push(part.segment);
    if (/^\p{Script=Han}{3,}$/u.test(part.segment)) {
      // oxlint-disable-next-line typescript/no-misused-spread -- this branch contains only Han code points, never combining marks or emoji.
      const characters = [...part.segment];
      for (let index = 0; index < characters.length - 1; index += 1)
        tokens.push(characters[index]! + characters[index + 1]!);
    }
  }
  return tokens;
}

interface LexicalDocument {
  key: string;
  length: number;
  frequencies: Map<string, number>;
  identifierDeclaration: boolean;
}

/** Request-scoped BM25 corpus. Stores only query-term frequencies, never a second content store. */
export class QueryLexicalIndex {
  readonly #terms: Set<string>;
  readonly identifier: string | undefined;
  readonly #documents: LexicalDocument[] = [];
  readonly #documentFrequency = new Map<string, number>();
  #totalLength = 0;

  constructor(query: string) {
    this.#terms = new Set(retrievalTokens(query));
    // A single code-shaped identifier is a lookup intent; natural-language queries keep fusion.
    const identifier = query.trim();
    if (/^[A-Za-z_$][\w$]*$/u.test(identifier) && /[a-z][A-Z]|_|^[A-Z].*[a-z]/u.test(identifier)) {
      this.identifier = identifier;
    }
  }

  add(key: string, text: string, identifierDeclaration = false): void {
    const tokens = retrievalTokens(text);
    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      if (this.#terms.has(token)) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
    for (const term of frequencies.keys())
      this.#documentFrequency.set(term, (this.#documentFrequency.get(term) ?? 0) + 1);
    this.#totalLength += tokens.length;
    this.#documents.push({
      key,
      length: tokens.length,
      frequencies,
      identifierDeclaration,
    });
  }

  declarationKeys(): ReadonlySet<string> {
    return new Set(
      this.#documents.filter((item) => item.identifierDeclaration).map((item) => item.key),
    );
  }

  scores(): ReadonlyMap<string, number> {
    const count = this.#documents.length;
    const averageLength = Math.max(1, this.#totalLength / Math.max(1, count));
    return new Map(
      this.#documents.map((document) => {
        let score = 0;
        for (const [term, frequency] of document.frequencies) {
          const df = this.#documentFrequency.get(term) ?? 0;
          const idf = Math.log(1 + (count - df + 0.5) / (df + 0.5));
          const denominator = frequency + 1.2 * (0.25 + (0.75 * document.length) / averageLength);
          score += (idf * frequency * 2.2) / denominator;
        }
        return [document.key, score];
      }),
    );
  }
}

export function passageIdentity(item: Pick<AnalysisItem, "path" | "range" | "line">): string {
  return JSON.stringify([item.path, item.range?.start ?? item.line, item.range?.end ?? item.line]);
}

/** RRF combines ranks, not incomparable BM25 and cosine magnitudes. Original scores remain visible. */
function tie(a: AnalysisItem, b: AnalysisItem): number {
  return a.path.localeCompare(b.path) || a.line - b.line;
}

export function rankRelevance(
  items: readonly AnalysisItem[],
  lexical: ReadonlyMap<string, number>,
  declarations: ReadonlySet<string> = new Set(),
): AnalysisItem[] {
  const semantic = [...items].toSorted(
    (a, b) => Number(b.details?.rankingScore) - Number(a.details?.rankingScore) || tie(a, b),
  );
  const keyword = items
    .filter((item) => (lexical.get(passageIdentity(item)) ?? 0) > 0)
    .toSorted(
      (a, b) =>
        (lexical.get(passageIdentity(b)) ?? 0) - (lexical.get(passageIdentity(a)) ?? 0) ||
        tie(a, b),
    );
  const lexicalRanks = new Map(keyword.map((item, index) => [passageIdentity(item), index + 1]));
  return semantic
    .map((item, index): AnalysisItem => {
      const key = passageIdentity(item);
      const lexicalRank = lexicalRanks.get(key);
      const semanticRank = index + 1;
      const relevanceScore =
        2 / (60 + semanticRank) + (lexicalRank === undefined ? 0 : 1 / (60 + lexicalRank));
      return Object.assign({}, item, {
        label: declarations.has(key)
          ? "Identifier declaration candidate (syntax; BM25 + semantic RRF)"
          : "Hybrid relevance candidate (BM25 + semantic RRF)",
        details: {
          ...item.details,
          source: "concept",
          ranking: "relevance",
          bm25: lexical.get(key) ?? 0,
          semanticRank,
          identifierDeclaration: declarations.has(key) ? 1 : 0,
          ...(lexicalRank === undefined ? {} : { lexicalRank }),
          relevanceScore,
          rankingReason:
            "request-scoped BM25 and E5 ranks fused with weighted RRF k=60 (semantic:lexical=2:1); single code-shaped identifier queries prefer syntax-confirmed declarations; candidate relevance, not binding or execution evidence",
        },
      });
    })
    .toSorted(
      (a, b) =>
        Number(b.details?.identifierDeclaration) - Number(a.details?.identifierDeclaration) ||
        Number(b.details?.relevanceScore) - Number(a.details?.relevanceScore) ||
        tie(a, b),
    );
}

/** Keep the best overlapping passage; do not collapse separate useful regions from the same file. */
export function distinctPassages(items: readonly AnalysisItem[]): AnalysisItem[] {
  const ranges = new Map<string, { start: number; end: number }[]>();
  return items.filter((item) => {
    if (!item.range) return true;
    const seen = ranges.get(item.path) ?? [];
    if (seen.some((range) => range.start < item.range!.end && item.range!.start < range.end))
      return false;
    seen.push(item.range);
    ranges.set(item.path, seen);
    return true;
  });
}
