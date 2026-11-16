import type { ReactNode } from "react";
import { safeHref, type Doc, type DocMark, type DocNode } from "@/lib/travelogue/doc";
import type { MediaItem } from "@/lib/journal/types";
import { cn } from "@/lib/cn";

/**
 * Zengin metnin salt okunur görünümü. HTML üretmez (dangerouslySetInnerHTML yok);
 * yalnızca izinli düğümleri React öğelerine çevirir. Görseller medya kimliğinden çözülür.
 */
export function DocView({ doc, media, className }: { doc: Doc | null | undefined; media: Map<string, MediaItem> | MediaItem[]; className?: string }) {
  if (!doc?.content?.length) return null;
  const byId = media instanceof Map ? media : new Map(media.map((m) => [m.id, m]));
  return <div className={cn("prose-rovia", className)}>{doc.content.map((n, i) => renderNode(n, i, byId))}</div>;
}

function renderMarks(text: ReactNode, marks: DocMark[] | undefined, key: number): ReactNode {
  let out = text;
  for (const m of marks ?? []) {
    if (m.type === "bold") out = <strong key={key}>{out}</strong>;
    else if (m.type === "italic") out = <em key={key}>{out}</em>;
    else if (m.type === "underline") out = <u key={key}>{out}</u>;
    else if (m.type === "link") {
      const href = safeHref(m.attrs.href);
      if (href) out = <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">{out}</a>;
    }
  }
  return out;
}

function renderNode(n: DocNode, key: number, media: Map<string, MediaItem>): ReactNode {
  const kids = () => (n.content ?? []).map((c, i) => renderNode(c, i, media));
  switch (n.type) {
    case "text":
      return <span key={key}>{renderMarks(n.text, n.marks, key)}</span>;
    case "hardBreak":
      return <br key={key} />;
    case "paragraph":
      return <p key={key}>{kids()}</p>;
    case "heading":
      return n.attrs?.level === 3 ? <h4 key={key}>{kids()}</h4> : <h3 key={key}>{kids()}</h3>;
    case "bulletList":
      return <ul key={key}>{kids()}</ul>;
    case "orderedList":
      return <ol key={key} start={Number(n.attrs?.start) || 1}>{kids()}</ol>;
    case "listItem":
      return <li key={key}>{kids()}</li>;
    case "blockquote":
      return <blockquote key={key}>{kids()}</blockquote>;
    case "horizontalRule":
      return <hr key={key} />;
    case "roviaImage": {
      const m = media.get(String(n.attrs?.mediaId));
      const caption = typeof n.attrs?.caption === "string" ? n.attrs.caption : null;
      if (!m?.url) return null;
      return (
        <figure key={key}>
          {/* eslint-disable-next-line @next/next/no-img-element -- imzalı Storage bağlantısı */}
          <img src={m.url} alt={caption ?? ""} width={m.width ?? undefined} height={m.height ?? undefined} loading="lazy" />
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
      );
    }
    default:
      return null;
  }
}
