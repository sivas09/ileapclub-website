import { parseDocument } from "htmlparser2";
import { documentText, type NoticeDocument, type NoticeInline, type NoticeText } from "../shared/noticeRichText";

type HtmlNode = ReturnType<typeof parseDocument>["children"][number];
type HtmlElementNode = HtmlNode & {
  name: string;
  attribs: Record<string, string>;
  children: HtmlNode[];
};

type InlineMarks = { bold?: true; italic?: true; underline?: true };

const discardedElements = new Set([
  "base", "embed", "head", "iframe", "img", "link", "math", "meta", "noscript", "object", "script", "style", "svg", "template", "title"
]);
const blockElements = new Set([
  "address", "article", "aside", "blockquote", "div", "footer", "form", "header", "h1", "h2", "h3", "h4", "h5", "h6", "main", "nav", "p", "section"
]);

export function noticeDocumentFromPaste(html: string, plainText: string): NoticeDocument {
  if (html.trim()) {
    const richDocument = noticeDocumentFromPastedHtml(html);

    if (documentText(richDocument).trim()) {
      return richDocument;
    }
  }

  return noticeDocumentFromPlainText(plainText);
}

export function noticeDocumentFromPastedHtml(html: string): NoticeDocument {
  const parsed = parseDocument(html, { decodeEntities: true });
  const blocks: NoticeDocument["blocks"] = [];
  let paragraph: NoticeInline[] = [];

  function flushParagraph() {
    trimBoundaryWhitespace(paragraph);

    if (paragraph.length) {
      blocks.push({ type: "p", content: paragraph });
      paragraph = [];
    }
  }

  function visit(node: HtmlNode, marks: InlineMarks = {}) {
    if (isTextNode(node)) {
      appendText(paragraph, node.data, marks, paragraph.length === 0);
      return;
    }

    if (!isElementNode(node)) {
      return;
    }

    const tag = node.name.toLowerCase();

    if (discardedElements.has(tag) || isWordListMarker(node)) {
      return;
    }

    if (tag === "br") {
      appendBreak(paragraph);
      return;
    }

    if (tag === "ul" || tag === "ol") {
      flushParagraph();
      const items = node.children
        .filter((child): child is HtmlElementNode => isElementNode(child) && child.name.toLowerCase() === "li")
        .map((item) => inlineContent(item.children, marks));

      if (items.length) {
        blocks.push({ type: tag, items });
      }
      return;
    }

    if (isWordListParagraph(node)) {
      flushParagraph();
      const item = inlineContent(node.children, marks);
      trimBoundaryWhitespace(item);

      if (item.length) {
        const type = wordListType(node);
        const previous = blocks[blocks.length - 1];

        if (previous?.type === type) {
          previous.items.push(item);
        } else {
          blocks.push({ type, items: [item] });
        }
      }
      return;
    }

    const nextMarks = marksForElement(node, marks);

    if (blockElements.has(tag)) {
      flushParagraph();
      node.children.forEach((child) => visit(child, nextMarks));
      flushParagraph();
    } else {
      node.children.forEach((child) => visit(child, nextMarks));
    }
  }

  parsed.children.forEach((node) => visit(node));
  flushParagraph();
  return { type: "doc", blocks };
}

export function noticeDocumentFromPlainText(value: string): NoticeDocument {
  const blocks: NoticeDocument["blocks"] = [];
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: NoticeInline[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: NoticeInline[][] = [];

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push({ type: "p", content: paragraph });
      paragraph = [];
    }
  }

  function flushList() {
    if (listType && listItems.length) {
      blocks.push({ type: listType, items: listItems });
    }
    listType = null;
    listItems = [];
  }

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);

    if (bullet || numbered) {
      flushParagraph();
      const nextType = bullet ? "ul" : "ol";

      if (listType && listType !== nextType) {
        flushList();
      }

      listType = nextType;
      listItems.push([{ type: "text", text: (bullet ?? numbered)![1] }]);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();

      if (paragraph.length) {
        paragraph.push({ type: "br" });
      }

      paragraph.push({ type: "text", text: line });
    }
  }

  flushParagraph();
  flushList();
  return { type: "doc", blocks };
}

export function noticeDocumentToEditorHtml(document: NoticeDocument) {
  return document.blocks.map((block) => {
    if (block.type === "p") {
      return `<p>${inlineHtml(block.content)}</p>`;
    }

    return `<${block.type}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${block.type}>`;
  }).join("");
}

function inlineContent(nodes: HtmlNode[], inheritedMarks: InlineMarks): NoticeInline[] {
  const content: NoticeInline[] = [];

  function visit(node: HtmlNode, marks: InlineMarks) {
    if (isTextNode(node)) {
      appendText(content, node.data, marks, false);
      return;
    }

    if (!isElementNode(node)) {
      return;
    }

    const tag = node.name.toLowerCase();

    if (discardedElements.has(tag) || isWordListMarker(node)) {
      return;
    }

    if (tag === "br") {
      appendBreak(content);
      return;
    }

    const nextMarks = marksForElement(node, marks);
    const needsBoundaryBreak = (blockElements.has(tag) || tag === "ul" || tag === "ol") && content.length > 0;

    if (needsBoundaryBreak) {
      appendBreak(content);
    }

    node.children.forEach((child) => visit(child, nextMarks));
  }

  nodes.forEach((node) => visit(node, inheritedMarks));
  trimBoundaryWhitespace(content);
  return content;
}

function marksForElement(element: HtmlElementNode, inherited: InlineMarks): InlineMarks {
  const marks: InlineMarks = { ...inherited };
  const tag = element.name.toLowerCase();
  const style = element.attribs.style?.toLowerCase() ?? "";

  if (tag === "strong" || tag === "b" || /font-weight\s*:\s*(?:bold|[6-9]00)\b/.test(style)) marks.bold = true;
  if (tag === "em" || tag === "i" || /font-style\s*:\s*(?:italic|oblique)\b/.test(style)) marks.italic = true;
  if (tag === "u" || /text-decoration(?:-line)?\s*:[^;]*\bunderline\b/.test(style)) marks.underline = true;
  return marks;
}

function isWordListParagraph(element: HtmlElementNode) {
  const className = element.attribs.class?.toLowerCase() ?? "";
  const style = element.attribs.style?.toLowerCase() ?? "";
  return className.includes("msolistparagraph") || style.includes("mso-list:");
}

function isWordListMarker(element: HtmlElementNode) {
  return (element.attribs.style?.toLowerCase() ?? "").includes("mso-list:ignore");
}

function wordListType(element: HtmlElementNode): "ul" | "ol" {
  const text = rawText(element).replace(/\u00a0/g, " ").trim();
  return /^(?:\d+|[a-z])[.)]\s/i.test(text) ? "ol" : "ul";
}

function rawText(node: HtmlNode): string {
  if (isTextNode(node)) {
    return node.data;
  }

  return isElementNode(node) ? node.children.map(rawText).join("") : "";
}

function appendText(content: NoticeInline[], value: string, marks: InlineMarks, ignoreWhitespaceOnly: boolean) {
  const normalizedValue = value.replace(/\u00a0/g, " ").replace(/[\t\r\n\f ]+/g, " ");

  if (!normalizedValue || (ignoreWhitespaceOnly && !normalizedValue.trim())) {
    return;
  }

  const text: NoticeText = { type: "text", text: normalizedValue };
  if (marks.bold) text.bold = true;
  if (marks.italic) text.italic = true;
  if (marks.underline) text.underline = true;

  const previous = content[content.length - 1];

  if (
    previous?.type === "text"
    && previous.bold === text.bold
    && previous.italic === text.italic
    && previous.underline === text.underline
  ) {
    previous.text += text.text;
  } else {
    content.push(text);
  }
}

function appendBreak(content: NoticeInline[]) {
  if (content.length && content[content.length - 1]?.type !== "br") {
    content.push({ type: "br" });
  }
}

function trimBoundaryWhitespace(content: NoticeInline[]) {
  while (content[0]?.type === "text" && !content[0].text.trim()) content.shift();
  while (content[content.length - 1]?.type === "br") content.pop();

  while (true) {
    const last = content[content.length - 1];

    if (last?.type !== "text" || last.text.trim()) {
      break;
    }

    content.pop();
  }
}

function inlineHtml(content: NoticeInline[]) {
  return content.map((inline) => {
    if (inline.type === "br") {
      return "<br>";
    }

    let value = escapeHtml(inline.text);
    if (inline.bold) value = `<strong>${value}</strong>`;
    if (inline.italic) value = `<em>${value}</em>`;
    if (inline.underline) value = `<u>${value}</u>`;
    return value;
  }).join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isTextNode(node: HtmlNode): node is HtmlNode & { data: string } {
  return node.type === "text" && "data" in node && typeof node.data === "string";
}

function isElementNode(node: HtmlNode): node is HtmlElementNode {
  return "name" in node && typeof node.name === "string" && "attribs" in node && "children" in node;
}
