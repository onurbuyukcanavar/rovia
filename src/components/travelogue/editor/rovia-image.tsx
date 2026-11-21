"use client";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { ImageOff, LoaderCircle, X } from "lucide-react";
import { useId } from "react";
import { DOC_LIMITS } from "@/lib/travelogue/doc";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { useEditorMedia } from "./media-context";

const tx = t.travelogue.editor.imageBlock;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    roviaImage: {
      /** Medya kimlikleriyle bir veya daha fazla fotoğraf bloğu ekler */
      insertRoviaImages: (images: { mediaId: string; caption?: string | null }[]) => ReturnType;
    };
  }
}

/** Fotoğraf bloğu: URL değil medya kimliği saklar (bkz. lib/travelogue/doc.ts). */
export const RoviaImage = Node.create({
  name: "roviaImage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      mediaId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-media-id"),
        renderHTML: (attrs) => ({ "data-media-id": attrs.mediaId }),
      },
      caption: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-caption") || null,
        renderHTML: (attrs) => (attrs.caption ? { "data-caption": attrs.caption } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-rovia-image]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes({ "data-rovia-image": "" }, HTMLAttributes)];
  },

  addCommands() {
    return {
      insertRoviaImages:
        (images) =>
        ({ commands }) =>
          commands.insertContent(
            images.map((i) => ({ type: this.name, attrs: { mediaId: i.mediaId, caption: i.caption ?? null } })),
          ),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(RoviaImageView);
  },
});

function RoviaImageView({ node, selected, updateAttributes, deleteNode, editor, getPos }: ReactNodeViewProps) {
  const { byId, waiting } = useEditorMedia();
  const inputId = useId();
  const mediaId = String(node.attrs.mediaId ?? "");
  const caption = typeof node.attrs.caption === "string" ? node.attrs.caption : "";
  const m = byId.get(mediaId);
  const src = m?.url ?? m?.thumbUrl ?? null;
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper
      as="figure"
      data-rovia-image=""
      data-testid="editor-image"
      className={cn("rovia-image group relative", selected && "is-selected")}
    >
      <div className="relative" data-drag-handle>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- imzalı Storage bağlantısı
          <img src={src} alt={caption} width={m?.width ?? undefined} height={m?.height ?? undefined} draggable={false} />
        ) : waiting.has(mediaId) ? (
          <div className="rovia-image-placeholder" role="status">
            <LoaderCircle className="size-6 animate-spin text-accent-ink" aria-hidden />
            <span>{tx.loading}</span>
          </div>
        ) : (
          <div className="rovia-image-placeholder">
            <ImageOff className="size-6 text-fg-subtle" aria-hidden />
            <span className="font-semibold">{tx.missing}</span>
            <span className="text-xs">{tx.missingHint}</span>
          </div>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => deleteNode()}
            title={tx.remove}
            aria-label={tx.remove}
            data-theme="dark"
            className="absolute top-2 right-2 grid size-9 place-items-center rounded-full border border-line bg-overlay/85 text-fg opacity-90 shadow-[var(--shadow-overlay)] backdrop-blur transition hover:bg-overlay focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-[.is-selected]:opacity-100"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {editable ? (
        <figcaption>
          <label htmlFor={inputId} className="sr-only">{tx.captionLabel}</label>
          <input
            id={inputId}
            type="text"
            defaultValue={caption}
            maxLength={DOC_LIMITS.maxCaption}
            placeholder={tx.captionPlaceholder}
            className="rovia-caption-input"
            onChange={(e) => updateAttributes({ caption: e.target.value || null })}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const pos = getPos();
              if (typeof pos === "number") editor.chain().focus(pos + node.nodeSize).run();
            }}
          />
        </figcaption>
      ) : (
        caption && <figcaption>{caption}</figcaption>
      )}
    </NodeViewWrapper>
  );
}
