"use client";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Underline, Undo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const tx = t.travelogue.editor;

function ToolButton({
  icon: Icon, label, shortcut, active, disabled, onClick, testId,
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  const title = shortcut ? `${label} ${tx.shortcut(shortcut)}` : label;
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      aria-keyshortcuts={shortcut?.replace("Ctrl", "Control")}
      disabled={disabled}
      data-testid={testId}
      // Odağı düzenleyicide tut (seçim kaybolmasın)
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl text-ink-800 transition sm:size-9",
        "hover:bg-sand-100 disabled:pointer-events-none disabled:opacity-35",
        active && "bg-ink-900 text-paper hover:bg-ink-800",
      )}
    >
      <Icon className="size-[1.1rem]" aria-hidden strokeWidth={2.1} />
    </button>
  );
}

const Sep = () => <span className="mx-1 h-6 w-px shrink-0 bg-sand-200" aria-hidden />;

export function EditorToolbar({
  editor, minimal, linkOpen, onLink, onImage,
}: {
  editor: Editor;
  minimal: boolean;
  linkOpen: boolean;
  onLink: () => void;
  onImage: () => void;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      quote: e.isActive("blockquote"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label={tx.toolbarLabel}
      aria-orientation="horizontal"
      className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain px-1.5 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {!minimal && (
        <>
          <ToolButton icon={Heading2} label={tx.heading} shortcut="Ctrl+Alt+2" active={s.h2}
            onClick={() => c().toggleHeading({ level: 2 }).run()} />
          <ToolButton icon={Heading3} label={tx.subheading} shortcut="Ctrl+Alt+3" active={s.h3}
            onClick={() => c().toggleHeading({ level: 3 }).run()} />
          <Sep />
        </>
      )}
      <ToolButton icon={Bold} label={tx.bold} shortcut="Ctrl+B" active={s.bold} onClick={() => c().toggleBold().run()} />
      <ToolButton icon={Italic} label={tx.italic} shortcut="Ctrl+I" active={s.italic} onClick={() => c().toggleItalic().run()} />
      <ToolButton icon={Underline} label={tx.underline} shortcut="Ctrl+U" active={s.underline} onClick={() => c().toggleUnderline().run()} />
      <ToolButton icon={Link2} label={tx.link} shortcut="Ctrl+K" active={s.link || linkOpen} onClick={onLink} testId="editor-link" />
      <Sep />
      {!minimal && (
        <ToolButton icon={Quote} label={tx.quote} shortcut="Ctrl+Shift+B" active={s.quote} onClick={() => c().toggleBlockquote().run()} />
      )}
      <ToolButton icon={List} label={tx.bulletList} shortcut="Ctrl+Shift+8" active={s.bullet} onClick={() => c().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label={tx.orderedList} shortcut="Ctrl+Shift+7" active={s.ordered} onClick={() => c().toggleOrderedList().run()} />
      {!minimal && (
        <>
          <ToolButton icon={Minus} label={tx.divider} onClick={() => c().setHorizontalRule().run()} />
          <Sep />
          <ToolButton icon={ImagePlus} label={tx.image} onClick={onImage} testId="editor-image-button" />
        </>
      )}
      <Sep />
      <ToolButton icon={Undo2} label={tx.undo} shortcut="Ctrl+Z" disabled={!s.canUndo} onClick={() => c().undo().run()} />
      <ToolButton icon={Redo2} label={tx.redo} shortcut="Ctrl+Shift+Z" disabled={!s.canRedo} onClick={() => c().redo().run()} />
    </div>
  );
}
