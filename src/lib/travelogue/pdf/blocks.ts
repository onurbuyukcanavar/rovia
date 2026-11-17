import { safeHref, type Doc, type DocNode } from "@/lib/travelogue/doc";

/**
 * TipTap belgesini PDF için düz bir ara blok listesine çevirir (saf; tarayıcı/React gerektirmez).
 * Bilinmeyen düğümler atılır; boş paragraflar korunmaz.
 */
export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; href?: string };

export type Block =
  | { type: "paragraph"; runs: Run[] }
  | { type: "heading"; level: 2 | 3; runs: Run[] }
  | { type: "list"; ordered: boolean; start: number; items: Block[][] }
  | { type: "quote"; children: Block[] }
  | { type: "hr" }
  | { type: "image"; mediaId: string; caption: string | null };

function inlineRuns(n: DocNode): Run[] {
  const out: Run[] = [];
  for (const c of n.content ?? []) {
    if (c.type === "hardBreak") out.push({ text: "\n" });
    else if (c.type === "text" && c.text) {
      const run: Run = { text: c.text };
      for (const m of c.marks ?? []) {
        if (m.type === "bold") run.bold = true;
        else if (m.type === "italic") run.italic = true;
        else if (m.type === "underline") run.underline = true;
        else if (m.type === "link") {
          const href = safeHref(m.attrs?.href);
          if (href) run.href = href;
        }
      }
      // Aynı biçimdeki ardışık parçaları birleştir
      const prev = out[out.length - 1];
      if (prev && prev.text !== "\n" && run.text !== "\n" && sameStyle(prev, run)) prev.text += run.text;
      else out.push(run);
    }
  }
  // Baştaki/sondaki satır sonlarını at
  while (out.length && out[0].text === "\n") out.shift();
  while (out.length && out[out.length - 1].text === "\n") out.pop();
  return out;
}

const sameStyle = (a: Run, b: Run) => !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && a.href === b.href;
const hasText = (runs: Run[]) => runs.some((r) => r.text.trim().length > 0);

function toBlocks(nodes: DocNode[] | undefined): Block[] {
  const out: Block[] = [];
  for (const n of nodes ?? []) {
    switch (n.type) {
      case "paragraph": {
        const runs = inlineRuns(n);
        if (hasText(runs)) out.push({ type: "paragraph", runs });
        break;
      }
      case "heading": {
        const runs = inlineRuns(n);
        if (hasText(runs)) out.push({ type: "heading", level: n.attrs?.level === 3 ? 3 : 2, runs });
        break;
      }
      case "bulletList":
      case "orderedList": {
        const items = (n.content ?? []).filter((c) => c.type === "listItem").map((li) => toBlocks(li.content)).filter((b) => b.length > 0);
        if (!items.length) break;
        const start = Number(n.attrs?.start);
        out.push({ type: "list", ordered: n.type === "orderedList", start: Number.isInteger(start) && start > 0 ? start : 1, items });
        break;
      }
      case "blockquote": {
        const children = toBlocks(n.content);
        if (children.length) out.push({ type: "quote", children });
        break;
      }
      case "horizontalRule":
        out.push({ type: "hr" });
        break;
      case "roviaImage": {
        const mediaId = n.attrs?.mediaId;
        if (typeof mediaId === "string" && mediaId) {
          const caption = typeof n.attrs?.caption === "string" && n.attrs.caption.trim() ? n.attrs.caption.trim() : null;
          out.push({ type: "image", mediaId, caption });
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

export function docToBlocks(doc: Doc | null | undefined): Block[] {
  if (!doc || !Array.isArray(doc.content)) return [];
  return toBlocks(doc.content);
}

/** Blok listesindeki görsel kimlikleri (sırayla, tekrarsız). */
export function blockImageIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b.type === "image") ids.push(b.mediaId);
      else if (b.type === "list") b.items.forEach(walk);
      else if (b.type === "quote") walk(b.children);
    }
  };
  walk(blocks);
  return [...new Set(ids)];
}
