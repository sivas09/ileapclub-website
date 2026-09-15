export const noticeRichTextPrefix = "ILEAP_RICH_TEXT_V1:";

export type NoticeText = {
  type: "text";
  text: string;
  bold?: true;
  italic?: true;
  underline?: true;
};

export type NoticeBreak = { type: "br" };
export type NoticeInline = NoticeText | NoticeBreak;

export type NoticeBlock =
  | { type: "p"; content: NoticeInline[] }
  | { type: "ul" | "ol"; items: NoticeInline[][] };

export type NoticeDocument = {
  type: "doc";
  blocks: NoticeBlock[];
};

export function noticeDocument(message: string): NoticeDocument {
  if (message.startsWith(noticeRichTextPrefix)) {
    const parsed = parseRichTextDocument(message);

    if (parsed) {
      return parsed;
    }
  }

  return legacyNoticeDocument(message);
}

export function serializeNoticeDocument(document: NoticeDocument) {
  return `${noticeRichTextPrefix}${JSON.stringify(sanitizeDocument(document))}`;
}

export function isValidStoredNoticeMessage(message: string) {
  return !message.startsWith(noticeRichTextPrefix) || parseRichTextDocument(message) !== null;
}

export function normalizeStoredNoticeMessage(message: string) {
  if (!message.startsWith(noticeRichTextPrefix)) {
    return message;
  }

  const parsed = parseRichTextDocument(message);
  return parsed ? serializeNoticeDocument(parsed) : message;
}

export function noticeMessageText(message: string) {
  return documentText(noticeDocument(message));
}

export function documentText(document: NoticeDocument) {
  return document.blocks.map((block) => block.type === "p"
    ? inlineText(block.content)
    : block.items.map(inlineText).join("\n")
  ).join("\n\n");
}

function parseRichTextDocument(message: string): NoticeDocument | null {
  try {
    const value: unknown = JSON.parse(message.slice(noticeRichTextPrefix.length));

    if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.blocks)) {
      return null;
    }

    return sanitizeDocument({ type: "doc", blocks: value.blocks as NoticeBlock[] });
  } catch {
    return null;
  }
}

function sanitizeDocument(document: NoticeDocument): NoticeDocument {
  const blocks: NoticeBlock[] = [];

  for (const candidate of document.blocks.slice(0, 250)) {
    if (!isRecord(candidate)) {
      continue;
    }

    if (candidate.type === "p" && Array.isArray(candidate.content)) {
      blocks.push({ type: "p", content: sanitizeInline(candidate.content) });
    } else if ((candidate.type === "ul" || candidate.type === "ol") && Array.isArray(candidate.items)) {
      blocks.push({
        type: candidate.type,
        items: candidate.items.slice(0, 250).filter(Array.isArray).map(sanitizeInline)
      });
    }
  }

  return { type: "doc", blocks };
}

function sanitizeInline(candidates: unknown[]): NoticeInline[] {
  const result: NoticeInline[] = [];

  for (const candidate of candidates.slice(0, 4_000)) {
    if (!isRecord(candidate)) {
      continue;
    }

    if (candidate.type === "br") {
      result.push({ type: "br" });
      continue;
    }

    if (candidate.type !== "text" || typeof candidate.text !== "string" || !candidate.text) {
      continue;
    }

    const text: NoticeText = { type: "text", text: candidate.text };

    if (candidate.bold === true) text.bold = true;
    if (candidate.italic === true) text.italic = true;
    if (candidate.underline === true) text.underline = true;
    appendText(result, text);
  }

  return result;
}

function legacyNoticeDocument(message: string): NoticeDocument {
  const blocks: NoticeBlock[] = [];
  const lines = message.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: NoticeInline[] = [];
  let items: NoticeInline[][] = [];

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ type: "p", content: paragraph });
      paragraph = [];
    }
  }

  function flushList() {
    if (items.length) {
      blocks.push({ type: "ul", items });
      items = [];
    }
  }

  for (const line of lines) {
    const bullet = line.match(/^\s*-\s+(.+)$/);

    if (bullet) {
      flushParagraph();
      items.push(legacyInline(bullet[1]));
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();

      if (paragraph.length) {
        paragraph.push({ type: "br" });
      }

      paragraph.push(...legacyInline(line));
    }
  }

  flushParagraph();
  flushList();
  return { type: "doc", blocks };
}

function legacyInline(value: string): NoticeInline[] {
  const result: NoticeInline[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > cursor) {
      appendText(result, { type: "text", text: value.slice(cursor, match.index) });
    }

    appendText(result, { type: "text", text: match[1], bold: true });
    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    appendText(result, { type: "text", text: value.slice(cursor) });
  }

  return result;
}

function appendText(result: NoticeInline[], text: NoticeText) {
  const previous = result[result.length - 1];

  if (
    previous?.type === "text"
    && previous.bold === text.bold
    && previous.italic === text.italic
    && previous.underline === text.underline
  ) {
    previous.text += text.text;
  } else {
    result.push(text);
  }
}

function inlineText(content: NoticeInline[]) {
  return content.map((inline) => inline.type === "br" ? "\n" : inline.text).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
