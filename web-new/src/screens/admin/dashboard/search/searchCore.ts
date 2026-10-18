/**
 * Global search: query normalisation and deterministic relevance scoring.
 *
 * Matching is case-, accent- and spacing-insensitive. Identifiers (job references,
 * vehicle registrations, driver initials) are also compared with every separator
 * removed, so "yc68vjz" finds "YC68 VJZ" and "tmv 489f" finds "TMV-489FDAB633". The
 * source values themselves are never changed.
 *
 * Scores are tiers, highest first; a result's score is its best field. Short queries
 * only use exact and prefix tiers: one or two letters never fall back to substring or
 * typo matching, which would match almost everything.
 */

export interface Normalized { text: string; compact: string; tokens: string[] }

/** Lower case, accents removed, whitespace collapsed. */
export function fold(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Letters and digits only: for identifiers whose separators don't matter. */
export function compact(value: string | null | undefined): string {
  return fold(value).replace(/[^a-z0-9]/g, "");
}

export function normalizeQuery(raw: string): Normalized {
  const text = fold(raw);
  return { text, compact: compact(text), tokens: text.split(" ").filter(Boolean) };
}

export const TIER = {
  exactId: 1000,
  exactText: 900,
  prefixId: 800,
  prefixText: 700,
  wholeWord: 680,
  wordPrefix: 650,
  substringId: 450,
  substringText: 350,
  fuzzy: 150
} as const;

export interface FieldMatch { score: number; field: string; start: number; end: number }
export interface Field { name: string; value: string | null | undefined; kind: "id" | "text" }

/** Edit distance with adjacent transpositions (one typo = 1), capped at 2. */
export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return Math.min(d[a.length][b.length], 2);
}

/** Best tier for one query token against one field. Positions refer to the folded field text. */
export function matchField(token: string, field: Field): FieldMatch | null {
  const value = fold(field.value);
  if (!value || !token) return null;
  const id = field.kind === "id";
  if (value === token) return { score: id ? TIER.exactId : TIER.exactText, field: field.name, start: 0, end: value.length };
  if (id) {
    const flat = value.replace(/[^a-z0-9]/g, ""), q = token.replace(/[^a-z0-9]/g, "");
    if (q && flat === q) return { score: TIER.exactId, field: field.name, start: 0, end: value.length };
  }
  if (value.startsWith(token)) return { score: id ? TIER.prefixId : TIER.prefixText, field: field.name, start: 0, end: token.length };
  const word = value.search(new RegExp(`(^|[\\s,.@\\-/(])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  if (word >= 0) {
    const start = word === 0 ? 0 : word + 1, end = start + token.length;
    // "report" is a whole word of "Generate report" but only the start of "Reports".
    const whole = end === value.length || /[\s,.@\-/)]/.test(value[end]);
    return { score: whole ? TIER.wholeWord : TIER.wordPrefix, field: field.name, start, end };
  }
  // Substring matching only once the query is specific enough.
  if (token.length >= (id ? 2 : 3)) {
    const at = value.indexOf(token);
    if (at >= 0) return { score: id ? TIER.substringId : TIER.substringText, field: field.name, start: at, end: at + token.length };
    if (id) {
      const flatToken = token.replace(/[^a-z0-9]/g, "");
      if (flatToken.length >= 3 && value.replace(/[^a-z0-9]/g, "").includes(flatToken)) return { score: TIER.substringId, field: field.name, start: 0, end: 0 };
    }
  }
  // One typo, words of 4+ letters only, and only against names.
  if (!id && token.length >= 4) {
    for (const part of value.split(/[\s,.@\-/]+/)) {
      if (part.length >= 4 && (editDistance(token, part) <= 1 || editDistance(token, part.slice(0, token.length)) <= 1 && part.length > token.length && token.length >= 5)) return { score: TIER.fuzzy, field: field.name, start: 0, end: 0 };
    }
  }
  return null;
}

/**
 * Scores a record: every query token must match some field (multi-word queries are
 * AND across fields, so "rm18 tiago" needs both). The record's score is the weakest
 * token's best match, plus a small bonus when the whole phrase matches one field.
 */
export function scoreRecord(query: Normalized, fields: Field[]): { score: number; highlight?: FieldMatch } | null {
  if (!query.tokens.length) return null;
  let total = Infinity, first: FieldMatch | undefined;
  for (const token of query.tokens) {
    let best: FieldMatch | null = null;
    for (const field of fields) {
      const match = matchField(token, field);
      if (match && (!best || match.score > best.score)) best = match;
    }
    if (!best) return null;
    total = Math.min(total, best.score);
    if (!first) first = best;
  }
  if (query.tokens.length > 1) {
    let phrase: FieldMatch | null = null;
    for (const field of fields) { const match = matchField(query.text, field); if (match && (!phrase || match.score > phrase.score)) phrase = match; }
    if (phrase) return { score: Math.max(total, phrase.score), highlight: phrase };
  }
  return { score: total, highlight: first };
}

/** Splits text into plain and highlighted parts for safe rendering (no HTML). */
export function highlightParts(text: string, query: Normalized): Array<{ text: string; hit: boolean }> {
  const folded = fold(text);
  // Folding can change length (accents); only highlight when positions line up.
  if (folded.length !== text.length || !query.tokens.length) return [{ text, hit: false }];
  const marks = new Array(text.length).fill(false);
  for (const token of [query.text, ...query.tokens]) {
    if (!token) continue;
    let from = 0, at: number;
    while ((at = folded.indexOf(token, from)) >= 0) {
      // Short tokens only light up at the start of a word, as they matched.
      const wordStart = at === 0 || /[^a-z0-9]/.test(folded[at - 1]);
      if (wordStart || token.length >= 3) for (let i = at; i < at + token.length; i++) marks[i] = true;
      from = at + token.length;
    }
  }
  const parts: Array<{ text: string; hit: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marks[i]) last.text += text[i]; else parts.push({ text: text[i], hit: marks[i] });
  }
  return parts;
}
