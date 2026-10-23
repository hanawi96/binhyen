export type ArticleBlock =
  | { kind: "heading"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "paragraph"; text: string };

const ABBREVIATIONS = new Set([
  "bs",
  "co",
  "dr",
  "gs",
  "inc",
  "ltd",
  "mr",
  "mrs",
  "pgs",
  "prof",
  "st",
  "ths",
  "tp",
  "ts",
  "vd"
]);

const CLOSERS = new Set(['"', "”", "’", "'", ")", "]", "»"]);
const OPENERS = new Set(['"', "“", "‘", "'", "«", "("]);

function soften(text: string): string {
  return text.replaceAll("**", "").trim();
}

function isLetter(char: string): boolean {
  return /\p{L}/u.test(char);
}

function isSpace(char: string): boolean {
  return /\s/u.test(char);
}

function tokenBefore(text: string, index: number): string {
  let cursor = index - 1;

  while (cursor >= 0 && /[\p{L}.]/u.test(text[cursor] ?? "")) cursor -= 1;

  return text.slice(cursor + 1, index);
}

function isAbbreviation(token: string): boolean {
  const parts = token.toLowerCase().split(".").filter(Boolean);

  if (parts.length === 0) return false;
  if (parts.length >= 2 && parts.every((part) => part.length === 1)) return true;

  return parts.every((part) => ABBREVIATIONS.has(part));
}

function sentenceMark(text: string, index: number): { end: number; dot: boolean } | null {
  const char = text[index];

  if (char === "." && text[index + 1] === "." && text[index + 2] === ".") {
    return { end: index + 3, dot: false };
  }

  if (char === "…" || char === "." || char === "!" || char === "?") {
    return { end: index + 1, dot: char === "." };
  }

  return null;
}

function nextSentenceStart(text: string, from: number): number | null {
  let cursor = from;

  while (CLOSERS.has(text[cursor] ?? "")) cursor += 1;
  if (!isSpace(text[cursor] ?? "")) return null;

  while (isSpace(text[cursor] ?? "")) cursor += 1;
  while (OPENERS.has(text[cursor] ?? "")) cursor += 1;

  return isLetter(text[cursor] ?? "") ? cursor : null;
}

function isShortFragment(part: string): boolean {
  return part.length < 8 && !/\s/u.test(part);
}

function joinShortFragments(parts: readonly string[]): string[] {
  const lines: string[] = [];

  for (const part of parts) {
    const previous = lines[lines.length - 1];

    if (previous && isShortFragment(part)) {
      lines[lines.length - 1] = `${previous} ${part}`;
      continue;
    }

    lines.push(part);
  }

  return lines;
}

/**
 * Mỗi câu một dòng. Giữ số, chữ viết tắt và mảnh ngắn với câu trước.
 */
export function splitSentences(text: string): string[] {
  const source = text.trim();
  if (!source) return [];

  const starts = [0];
  let index = 0;

  while (index < source.length) {
    const mark = sentenceMark(source, index);

    if (!mark) {
      index += 1;
      continue;
    }

    if (mark.dot && isAbbreviation(tokenBefore(source, index))) {
      index = mark.end;
      continue;
    }

    const next = nextSentenceStart(source, mark.end);

    if (next === null) {
      index = mark.end;
      continue;
    }

    starts.push(next);
    index = next;
  }

  const parts: string[] = [];

  for (let cursor = 0; cursor < starts.length; cursor += 1) {
    const from = starts[cursor] ?? 0;
    const to = starts[cursor + 1] ?? source.length;
    const piece = source.slice(from, to).trim();
    if (piece) parts.push(piece);
  }

  return joinShortFragments(parts);
}

/**
 * Chia Markdown đơn giản thành đoạn, đề mục và trích dẫn.
 * Không kéo thư viện phân tích vào trang.
 */
export function readBlocks(source: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];

  function flushParagraph() {
    const text = soften(paragraph.join(" "));
    paragraph = [];
    if (text) blocks.push({ kind: "paragraph", text });
  }

  function flushQuote() {
    const text = soften(quote.join(" "));
    quote = [];
    if (text) blocks.push({ kind: "quote", text });
  }

  for (const raw of source.replaceAll("\r\n", "\n").split("\n")) {
    const line = raw.trim();

    if (!line) {
      flushParagraph();
      flushQuote();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);

    if (heading) {
      flushParagraph();
      flushQuote();
      const text = soften(heading[2] ?? "");
      if (text) blocks.push({ kind: "heading", text });
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }

    flushQuote();
    paragraph.push(line);
  }

  flushParagraph();
  flushQuote();
  return blocks;
}
