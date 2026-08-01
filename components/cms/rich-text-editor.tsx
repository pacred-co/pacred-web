"use client";

/**
 * Google-Docs-style WYSIWYG for the article body (ปอน 2026-08-01).
 *
 * Replaces the old plain <textarea> whose text was re-interpreted by a heuristic
 * parser into fixed cards — the author could not control the layout. Here what
 * you see IS what the page renders: the editor surface carries the SAME
 * `.article-doc` class the public page uses, so headings/lists/quotes/tables
 * look identical while typing.
 *
 * Stores HTML. Sanitised server-side on save AND on read (never trust the
 * client) — see lib/cms/sanitize-article-html.ts.
 *
 * Used for สาระน่ารู้ + ข่าวสาร only. ผลงานของเรา (our_work) keeps the legacy
 * textarea + card renderer, untouched by request.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading2, Heading3, List, ListOrdered, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight,
  Link2, Link2Off, ImagePlus, Table as TableIcon, Trash2,
  Undo2, Redo2, RemoveFormatting,
} from "lucide-react";

type Props = {
  value: string;
  onChange: (html: string) => void;
  /** Upload a file and resolve to its public URL (reuses the CMS cover upload). */
  onUploadImage?: (file: File) => Promise<string | null>;
  disabled?: boolean;
};

/** One toolbar button. `active` = the mark/node under the caret. */
function TBtn({
  onClick, title, active, disabled, children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-[13px] transition disabled:opacity-40 ${
        active
          ? "border-primary-300 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
          : "border-transparent text-foreground hover:bg-surface-alt"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

function Toolbar({
  editor, onPickImage, uploading,
}: {
  editor: Editor;
  onPickImage: () => void;
  uploading: boolean;
}) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("ใส่ลิงก์ (เว้นว่าง = ยกเลิกลิงก์)", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }, [editor]);

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-border bg-white/95 p-1.5 backdrop-blur dark:bg-surface/95">
      <TBtn title="เลิกทำ" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo2 className="h-4 w-4" /></TBtn>
      <TBtn title="ทำซ้ำ" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo2 className="h-4 w-4" /></TBtn>
      <Divider />
      <TBtn title="หัวข้อใหญ่ (H2)" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></TBtn>
      <TBtn title="หัวข้อย่อย (H3)" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></TBtn>
      <Divider />
      <TBtn title="ตัวหนา" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></TBtn>
      <TBtn title="ตัวเอียง" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></TBtn>
      <TBtn title="ขีดเส้นใต้" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></TBtn>
      <TBtn title="ขีดฆ่า" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></TBtn>
      <TBtn title="ล้างรูปแบบ" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting className="h-4 w-4" /></TBtn>
      <Divider />
      <TBtn title="ลิสต์จุด" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></TBtn>
      <TBtn title="ลิสต์ตัวเลข" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></TBtn>
      <TBtn title="ข้อความยกมา" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></TBtn>
      <TBtn title="เส้นคั่น" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></TBtn>
      <Divider />
      <TBtn title="ชิดซ้าย" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></TBtn>
      <TBtn title="กึ่งกลาง" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></TBtn>
      <TBtn title="ชิดขวา" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></TBtn>
      <Divider />
      <TBtn title="ใส่ลิงก์" active={editor.isActive("link")} onClick={setLink}><Link2 className="h-4 w-4" /></TBtn>
      <TBtn title="เอาลิงก์ออก" disabled={!editor.isActive("link")} onClick={() => editor.chain().focus().unsetLink().run()}><Link2Off className="h-4 w-4" /></TBtn>
      <TBtn title={uploading ? "กำลังอัปโหลด…" : "แทรกรูป"} disabled={uploading} onClick={onPickImage}><ImagePlus className="h-4 w-4" /></TBtn>
      <Divider />
      <TBtn title="แทรกตาราง 3×3" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="h-4 w-4" /></TBtn>
      <TBtn title="ลบตาราง" disabled={!editor.isActive("table")} onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 className="h-4 w-4" /></TBtn>
    </div>
  );
}

export function RichTextEditor({ value, onChange, onUploadImage, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  // State, not a ref: the toolbar has to re-render to show "กำลังอัปโหลด…" and
  // disable the button while the upload is in flight.
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    // Next SSR: render on the client only, else React hydration mismatches.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Only H2-H4 — H1 is the page's own <h1> (the article title); letting the
        // body emit another one would break the heading outline for SEO.
        heading: { levels: [2, 3, 4] },
        link: false, // configured separately below
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Image.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
    ],
    content: value || "",
    editable: !disabled,
    editorProps: {
      attributes: {
        // Same class as the public page → true WYSIWYG, one source of styling.
        class: "article-doc min-h-[420px] px-4 py-4 focus:outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      // Tiptap's "empty" document is "<p></p>" — store "" so the article reads
      // as having no body rather than an empty paragraph.
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Keep the editor in sync when the parent replaces the value from outside
  // (e.g. after a save re-fetch, or switching the TH/EN tab). Guard on equality
  // so we never clobber what the author is typing.
  useEffect(() => {
    if (!editor) return;
    const next = value || "";
    if (next !== editor.getHTML() && next !== "") {
      editor.commands.setContent(next, { emitUpdate: false });
    } else if (next === "" && editor.getHTML() !== "<p></p>") {
      editor.commands.clearContent(false);
    }
    // Intentionally keyed on `value` only — reacting to `editor` identity would
    // reset the document on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  async function handleFile(file: File | undefined) {
    if (!file || !editor || !onUploadImage || uploading) return;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      if (url) editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!editor) {
    return <div className="rounded-xl border border-border bg-white p-4 text-sm text-muted dark:bg-surface">กำลังเปิดตัวเขียน…</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white dark:bg-surface">
      <Toolbar editor={editor} uploading={uploading} onPickImage={() => fileRef.current?.click()} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <EditorContent editor={editor} />
    </div>
  );
}
