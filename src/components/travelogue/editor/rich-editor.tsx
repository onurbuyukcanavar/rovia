"use client";
import { Extension } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState, type JSX } from "react";
import { safeHref, sanitizeDoc, wordCount, type Doc } from "@/lib/travelogue/doc";
import type { MediaItem } from "@/lib/journal/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { ImagePicker } from "./image-picker";
import { LinkPopover } from "./link-popover";
import { EditorMediaContext } from "./media-context";
import { RoviaImage } from "./rovia-image";
import { EditorToolbar } from "./toolbar";

const tx = t.travelogue.editor;

export type RichEditorProps = {
  /** İlk değer (bağlandıktan sonra denetimsiz) */
  value: Doc | null;
  /** Her değişiklikte temizlenmiş belge (boşsa null) */
  onChange: (doc: Doc | null) => void;
  /** Eklenebilen / kimlikle çözülen fotoğraflar */
  media: MediaItem[];
  userId: string;
  tripId: string | null;
  /** Yeni yüklenen fotoğraflar; üst bileşen medya listesini yeniler (router.refresh()) */
  onMediaUploaded?: (ids: string[]) => void;
  placeholder?: string;
  /** Kısa alanlar için: başlık/alıntı/ayraç/görsel düğmeleri yok */
  minimal?: boolean;
  /** Yazı alanının erişilebilir adı */
  label: string;
  testId?: string;
};

/** ROVIA Journal zengin metin düzenleyicisi (TipTap). Çıktı lib/travelogue/doc.ts biçimindedir. */
export function RichEditor({
  value, onChange, media, userId, tripId, onMediaUploaded, placeholder, minimal = false, label, testId,
}: RichEditorProps): JSX.Element {
  const onChangeRef = useRef(onChange);
  const openLinkRef = useRef<() => void>(() => {});
  const [link, setLink] = useState<{ href: string; hasLink: boolean } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        strike: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
          // Yalnızca http(s) ve mailto (doc.ts ile aynı kural)
          isAllowedUri: (url) => safeHref(url) !== null,
          shouldAutoLink: (url) => safeHref(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`) !== null,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
        },
      }),
      Placeholder.configure({ placeholder: placeholder ?? tx.placeholder }),
      RoviaImage,
      Extension.create({
        name: "roviaShortcuts",
        addKeyboardShortcuts() {
          return {
            "Mod-k": () => {
              openLinkRef.current();
              return true;
            },
          };
        },
      }),
    ],
    content: value ?? undefined,
    editorProps: {
      attributes: {
        class: cn("prose-rovia rovia-editor-content", minimal && "is-minimal"),
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(testId ? { "data-testid": testId } : {}),
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(sanitizeDoc(e.getJSON())),
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    openLinkRef.current = () => {
      if (!editor) return;
      const hasLink = editor.isActive("link");
      setLink({ href: hasLink ? String(editor.getAttributes("link").href ?? "") : "", hasLink });
    };
  }, [editor]);

  const words = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? wordCount(e.getText({ blockSeparator: "\n\n" })) : 0),
  });

  const byId = new Map(media.map((m) => [m.id, m]));
  const waiting = uploaded.filter((id) => !byId.has(id));

  function applyLink(href: string) {
    if (!editor) return;
    const { empty } = editor.state.selection;
    if (empty && !editor.isActive("link")) {
      editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLink(null);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLink(null);
  }

  function insertImages(ids: string[]) {
    if (editor && ids.length) {
      editor.chain().focus().insertRoviaImages(ids.map((id) => ({ mediaId: id, caption: byId.get(id)?.caption ?? null }))).run();
    }
    setPickerOpen(false);
  }

  return (
    <EditorMediaContext.Provider value={{ byId, waiting: new Set(waiting) }}>
      <div
        className={cn(
          "rovia-editor rounded-[var(--radius-card)] border border-line bg-raised shadow-[var(--shadow-card)] transition-[border-color,box-shadow] focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/15",
        )}
        data-minimal={minimal || undefined}
      >
        <div className="sticky top-[var(--mobile-header)] z-20 rounded-t-[var(--radius-card)] border-b border-line bg-chrome backdrop-blur lg:top-0">
          {editor ? (
            <EditorToolbar
              editor={editor}
              minimal={minimal}
              linkOpen={link !== null}
              onLink={() => openLinkRef.current()}
              onImage={() => setPickerOpen(true)}
            />
          ) : (
            <div className="h-[3.25rem] sm:h-12" aria-hidden />
          )}
          {link && (
            <LinkPopover
              initialHref={link.href}
              hasLink={link.hasLink}
              onApply={applyLink}
              onRemove={removeLink}
              onClose={() => {
                setLink(null);
                editor?.commands.focus();
              }}
            />
          )}
        </div>

        <EditorContent editor={editor} className={cn("px-4 py-4 sm:px-6", minimal ? "min-h-28" : "min-h-64")} />

        <div className="flex justify-end border-t border-line px-4 py-1.5 sm:px-6">
          <span className="text-xs text-fg-subtle tabular-nums" aria-live="off" data-testid={testId ? `${testId}-words` : undefined}>
            {tx.words(words ?? 0)}
          </span>
        </div>
      </div>

      {pickerOpen && (
        <ImagePicker
          media={media}
          waiting={waiting}
          userId={userId}
          tripId={tripId}
          onUploaded={(ids) => {
            setUploaded((u) => [...u, ...ids]);
            onMediaUploaded?.(ids);
          }}
          onInsert={insertImages}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </EditorMediaContext.Provider>
  );
}
