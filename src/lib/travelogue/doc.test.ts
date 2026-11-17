import { describe, expect, it } from "vitest";
import { docMediaIds, docToText, isDocEmpty, safeHref, sanitizeDoc, wordCount, type Doc } from "./doc";

const ID = "6F1C2B3A-1111-4222-8333-944455556666";
const p = (text: string, marks?: unknown[]) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });

describe("safeHref", () => {
  it("allows http(s) and mailto only", () => {
    expect(safeHref("https://rovia.app/a")).toBe("https://rovia.app/a");
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref(" JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("rovia.app")).toBeNull();
    expect(safeHref(42)).toBeNull();
  });
});

describe("sanitizeDoc", () => {
  it("returns null for non-docs and empty docs", () => {
    expect(sanitizeDoc(null)).toBeNull();
    expect(sanitizeDoc({ type: "paragraph" })).toBeNull();
    expect(sanitizeDoc({ type: "doc", content: [{ type: "paragraph" }] })).toBeNull();
    expect(sanitizeDoc({ type: "doc", content: [p("   ")] })).toBeNull();
  });

  it("strips unknown nodes and marks", () => {
    const out = sanitizeDoc({
      type: "doc",
      content: [
        { type: "codeBlock", content: [{ type: "text", text: "x" }] },
        { type: "image", attrs: { src: "https://x/y.png" } },
        p("merhaba", [{ type: "bold" }, { type: "strike" }, { type: "code" }, { type: "bold" }, { type: "italic" }]),
        { type: "paragraph", content: [{ type: "text", text: "a" }, { type: "mention", attrs: { id: 1 } }, { type: "hardBreak" }] },
      ],
    });
    expect(out).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "merhaba", marks: [{ type: "bold" }, { type: "italic" }] }] },
        { type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }] },
      ],
    });
  });

  it("drops javascript: links but keeps the text", () => {
    const out = sanitizeDoc({
      type: "doc",
      content: [
        p("kötü", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
        p("iyi", [{ type: "link", attrs: { href: "https://example.com", target: "_blank", onclick: "x" } }]),
      ],
    });
    expect(out?.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "kötü" }] });
    expect(out?.content[1].content?.[0].marks).toEqual([{ type: "link", attrs: { href: "https://example.com/" } }]);
  });

  it("validates roviaImage mediaId and normalizes caption", () => {
    const out = sanitizeDoc({
      type: "doc",
      content: [
        { type: "roviaImage", attrs: { mediaId: "not-a-uuid", caption: "x" } },
        { type: "roviaImage", attrs: { mediaId: "https://evil/x.png" } },
        { type: "roviaImage", attrs: { mediaId: ID, caption: "  Kapadokya  ", src: "https://x" } },
        { type: "roviaImage", attrs: { mediaId: ID, caption: "   " } },
      ],
    });
    expect(out?.content).toEqual([
      { type: "roviaImage", attrs: { mediaId: ID.toLowerCase(), caption: "Kapadokya" } },
      { type: "roviaImage", attrs: { mediaId: ID.toLowerCase(), caption: null } },
    ]);
  });

  it("keeps allowed structure and fixes attrs", () => {
    const out = sanitizeDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "B" }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "A" }] },
        { type: "orderedList", attrs: { start: -4 }, content: [{ type: "listItem", content: [p("1")] }, p("not item")] },
        { type: "bulletList", content: [p("no items")] },
        { type: "blockquote", content: [] },
        { type: "horizontalRule", attrs: { x: 1 } },
      ],
    });
    expect(out?.content).toEqual([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "B" }] },
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "A" }] },
      { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p("1")] }] },
      { type: "blockquote", content: [{ type: "paragraph" }] },
      { type: "horizontalRule" },
    ]);
  });

  it("drops top-level inline nodes and too-deep nesting", () => {
    let deep: Record<string, unknown> = p("derin");
    for (let i = 0; i < 20; i++) deep = { type: "blockquote", content: [deep] };
    const out = sanitizeDoc({ type: "doc", content: [{ type: "text", text: "çıplak" }, deep, p("ok")] });
    expect(docToText(out)).toBe("ok");
  });
});

describe("isDocEmpty / docToText / helpers", () => {
  const doc: Doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Göreme" }] },
      { type: "paragraph", content: [{ type: "text", text: "Sabah " }, { type: "text", text: "balonlar", marks: [{ type: "bold" }] }, { type: "hardBreak" }, { type: "text", text: "uçtu." }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Uçhisar" }] }] }] },
      { type: "roviaImage", attrs: { mediaId: ID.toLowerCase(), caption: "Gün doğumu" } },
      { type: "roviaImage", attrs: { mediaId: ID.toLowerCase(), caption: null } },
    ],
  };

  it("isDocEmpty", () => {
    expect(isDocEmpty(null)).toBe(true);
    expect(isDocEmpty({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "  " }] }] })).toBe(true);
    expect(isDocEmpty({ type: "doc", content: [{ type: "horizontalRule" }] })).toBe(false);
    expect(isDocEmpty({ type: "doc", content: [{ type: "roviaImage", attrs: { mediaId: ID } }] })).toBe(false);
    expect(isDocEmpty(doc)).toBe(false);
  });

  it("docToText joins blocks with blank lines and includes captions", () => {
    expect(docToText(null)).toBe("");
    expect(docToText(doc)).toBe("Göreme\n\nSabah balonlar\nuçtu.\n\nUçhisar\n\nGün doğumu");
    expect(wordCount(docToText(doc))).toBe(7);
    expect(wordCount("   ")).toBe(0);
  });

  it("docMediaIds is unique", () => {
    expect(docMediaIds(doc)).toEqual([ID.toLowerCase()]);
  });
});
