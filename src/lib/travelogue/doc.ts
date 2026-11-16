/**
 * ROVIA Journal zengin metin biçimi: TipTap (ProseMirror) JSON.
 * Yalnızca aşağıdaki düğüm ve işaretlere izin verilir; geri kalan her şey sunucuda atılır.
 * Görseller URL değil medya kimliğiyle saklanır (özel kova, imzalı bağlantılar süreli).
 *
 * Düğümler: doc, paragraph, heading{level:2|3}, text, bulletList, orderedList{start},
 *           listItem, blockquote, hardBreak, horizontalRule, roviaImage{mediaId, caption}
 * İşaretler: bold, italic, underline, link{href: http(s)/mailto}
 */
export type DocMark =
  | { type: "bold" | "italic" | "underline" }
  | { type: "link"; attrs: { href: string } };

export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
};

export type Doc = { type: "doc"; content: DocNode[] };

export const DOC_LIMITS = { maxNodes: 20_000, maxDepth: 12, maxTextLength: 200_000, maxCaption: 500 } as const;

const BLOCK_CONTAINERS = new Set(["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote"]);
const LEAVES = new Set(["text", "hardBreak", "horizontalRule", "roviaImage"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const href = raw.trim();
  if (!href || href.length > 2000) return null;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function cleanMarks(marks: unknown): DocMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: DocMark[] = [];
  const seen = new Set<string>();
  for (const m of marks) {
    const type = (m as { type?: unknown })?.type;
    if (typeof type !== "string" || seen.has(type)) continue;
    if (type === "bold" || type === "italic" || type === "underline") out.push({ type });
    else if (type === "link") {
      const href = safeHref((m as { attrs?: { href?: unknown } }).attrs?.href);
      if (href) out.push({ type: "link", attrs: { href } });
    } else continue;
    seen.add(type);
  }
  return out.length ? out : undefined;
}

/** Bilinmeyen/zararlı içeriği atarak güvenli bir belge döndürür; boş belge için null. */
export function sanitizeDoc(input: unknown): Doc | null {
  if (!input || typeof input !== "object" || (input as { type?: unknown }).type !== "doc") return null;
  let nodes = 0;
  let textLen = 0;

  function clean(n: unknown, depth: number): DocNode | null {
    if (!n || typeof n !== "object" || depth > DOC_LIMITS.maxDepth || ++nodes > DOC_LIMITS.maxNodes) return null;
    const node = n as DocNode;
    const type = node.type;
    if (typeof type !== "string") return null;

    if (type === "text") {
      if (typeof node.text !== "string" || !node.text) return null;
      const room = DOC_LIMITS.maxTextLength - textLen;
      if (room <= 0) return null;
      const text = node.text.slice(0, room);
      textLen += text.length;
      const marks = cleanMarks(node.marks);
      return marks ? { type, text, marks } : { type, text };
    }
    if (type === "hardBreak" || type === "horizontalRule") return { type };
    if (type === "roviaImage") {
      const mediaId = node.attrs?.mediaId;
      if (typeof mediaId !== "string" || !UUID.test(mediaId)) return null;
      const cap = typeof node.attrs?.caption === "string" ? node.attrs.caption.trim().slice(0, DOC_LIMITS.maxCaption) : "";
      return { type, attrs: { mediaId: mediaId.toLowerCase(), caption: cap || null } };
    }
    if (!BLOCK_CONTAINERS.has(type)) return null;

    const content = Array.isArray(node.content)
      ? node.content.map((c) => clean(c, depth + 1)).filter((c): c is DocNode => c !== null)
      : [];
    const out: DocNode = { type };
    if (type === "heading") {
      const level = node.attrs?.level === 3 ? 3 : 2;
      out.attrs = { level };
    } else if (type === "orderedList") {
      const start = Number(node.attrs?.start);
      out.attrs = { start: Number.isInteger(start) && start > 0 && start < 10000 ? start : 1 };
    }
    // Yapısal kurallar: liste yalnızca listItem içerir; listItem/blockquote blok içerir
    if (type === "bulletList" || type === "orderedList") {
      const items = content.filter((c) => c.type === "listItem");
      if (!items.length) return null;
      out.content = items;
    } else if (type === "listItem" || type === "blockquote") {
      const blocks = content.filter((c) => !LEAVES.has(c.type) || c.type === "horizontalRule" || c.type === "roviaImage");
      out.content = blocks.length ? blocks : [{ type: "paragraph" }];
    } else {
      // paragraph/heading: yalnızca satır içi içerik
      const inline = content.filter((c) => c.type === "text" || c.type === "hardBreak");
      if (inline.length) out.content = inline;
    }
    return out;
  }

  const raw = Array.isArray((input as Doc).content) ? (input as Doc).content : [];
  const content = raw.map((c) => clean(c, 1)).filter((c): c is DocNode => c !== null && c.type !== "listItem" && c.type !== "text" && c.type !== "hardBreak");
  if (!content.length) return null;
  const doc: Doc = { type: "doc", content };
  return isDocEmpty(doc) ? null : doc;
}

/** Yazı veya görsel içermeyen belge boştur. */
export function isDocEmpty(doc: Doc | null | undefined): boolean {
  if (!doc) return true;
  const walk = (n: DocNode): boolean =>
    (n.type === "text" && !!n.text?.trim()) || n.type === "roviaImage" || n.type === "horizontalRule" || (n.content ?? []).some(walk);
  return !doc.content.some(walk);
}

/** Düz metin (arama, PDF/özet ve kelime sayısı için). Bloklar arasında boş satır. */
export function docToText(doc: Doc | null | undefined): string {
  if (!doc) return "";
  const parts: string[] = [];
  const inline = (n: DocNode): string =>
    n.type === "text" ? (n.text ?? "") : n.type === "hardBreak" ? "\n" : (n.content ?? []).map(inline).join("");
  const block = (n: DocNode) => {
    if (n.type === "paragraph" || n.type === "heading") {
      const t = inline(n).trim();
      if (t) parts.push(t);
    } else if (n.type === "roviaImage") {
      if (typeof n.attrs?.caption === "string" && n.attrs.caption) parts.push(n.attrs.caption);
    } else for (const c of n.content ?? []) block(c);
  };
  for (const n of doc.content) block(n);
  return parts.join("\n\n");
}

/** Belgede geçen medya kimlikleri (görsel URL'lerini imzalamak için). */
export function docMediaIds(doc: Doc | null | undefined): string[] {
  const out: string[] = [];
  const walk = (n: DocNode) => {
    if (n.type === "roviaImage" && typeof n.attrs?.mediaId === "string") out.push(n.attrs.mediaId);
    for (const c of n.content ?? []) walk(c);
  };
  for (const n of doc?.content ?? []) walk(n);
  return [...new Set(out)];
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
