"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import {
  HIGHLIGHT_COLORS,
  htmlToText,
  isHtml,
  sanitizeDecisionHtml,
  textToHtml,
} from "@/lib/decisions/richtext";

function ToolButton({
  editor,
  title,
  active,
  onRun,
  children,
}: {
  editor: Editor;
  title: string;
  active?: boolean;
  onRun: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onRun();
        editor.commands.focus();
      }}
      className={`min-w-7 shrink-0 cursor-pointer rounded-md px-1.5 py-1 text-[12px] font-semibold transition-colors ${
        active ? "bg-[#27241F] text-[#F5F1E8]" : "text-[#3A352D] hover:bg-[#F5F1E8]"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Shared rich-text editor (Tiptap, bundled - no CDN), never markdown.
 * Stores sanitized HTML; legacy plain text upgrades to paragraphs on
 * load. Commits on blur like every other field.
 */
export function RichTextEditor({
  value,
  hint,
  label = "Rich text",
  onDone,
}: {
  value: string;
  hint?: string;
  label?: string;
  onDone: (html: string) => void;
}) {
  const [, setTick] = useState(0);
  const committed = useRef<string | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const bump = () => setTick((t) => t + 1);

  const editor = useEditor({
    extensions: [StarterKit, Highlight.configure({ multicolor: true })],
    content: value.trim() === "" ? "" : isHtml(value) ? sanitizeDecisionHtml(value) : textToHtml(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": label,
        spellcheck: "false",
      },
    },
    onTransaction: bump,
    onSelectionUpdate: bump,
    onBlur: ({ editor: e }) => {
      const clean = sanitizeDecisionHtml(e.getHTML());
      const next = htmlToText(clean) ? clean : "";
      if (committed.current !== next) {
        committed.current = next;
        doneRef.current(next);
      }
    },
  });

  // External edits (AI propose, import, undo elsewhere) land without
  // clobbering an in-progress keystroke: only when the doc truly differs.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const incoming = value.trim() === "" ? "" : isHtml(value) ? sanitizeDecisionHtml(value) : textToHtml(value);
    if (incoming !== committed.current && editor.getHTML() !== incoming) {
      editor.commands.setContent(incoming);
      committed.current = incoming;
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="rounded-xl border border-[#E8E2D8] bg-white px-4 py-6 text-[13px] text-[#A39B8E]">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#E8E2D8] bg-white transition-colors focus-within:border-[#C9A86A]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#EFE9DB] bg-[#FBFAF7] px-2 py-1.5" role="toolbar" aria-label="Formatting">
        <ToolButton editor={editor} title="Bold" active={editor.isActive("bold")} onRun={() => editor.chain().toggleBold().run()}>
          <span className="font-bold">B</span>
        </ToolButton>
        <ToolButton editor={editor} title="Italic" active={editor.isActive("italic")} onRun={() => editor.chain().toggleItalic().run()}>
          <span className="italic">I</span>
        </ToolButton>
        <ToolButton editor={editor} title="Strikethrough" active={editor.isActive("strike")} onRun={() => editor.chain().toggleStrike().run()}>
          <span className="line-through">S</span>
        </ToolButton>
        <ToolButton editor={editor} title="Highlight (yellow)" active={editor.isActive("highlight")} onRun={() => editor.chain().toggleHighlight({ color: HIGHLIGHT_COLORS[0] }).run()}>
          <span className="rounded-sm px-0.5" style={{ backgroundColor: HIGHLIGHT_COLORS[0] }}>H</span>
        </ToolButton>
        <span className="inline-flex shrink-0 items-center gap-1 px-1" role="group" aria-label="Highlight color">
          {HIGHLIGHT_COLORS.map((c) => {
            const on = editor.isActive("highlight", { color: c });
            return (
              <button
                key={c}
                type="button"
                title={`Highlight ${c}`}
                aria-label={`Highlight ${c}`}
                aria-pressed={on}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (on) editor.chain().unsetHighlight().run();
                  else editor.chain().setHighlight({ color: c }).run();
                  editor.commands.focus();
                }}
                style={{ backgroundColor: c }}
                className={`h-3.5 w-3.5 cursor-pointer rounded-full border transition-transform ${
                  on ? "scale-110 border-[#27241F] ring-1 ring-[#27241F]" : "border-black/20 hover:scale-110"
                }`}
              />
            );
          })}
        </span>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-[#E8E2D8]" />
        <ToolButton editor={editor} title="Heading" active={editor.isActive("heading", { level: 2 })} onRun={() => editor.chain().toggleHeading({ level: 2 }).run()}>
          H2
        </ToolButton>
        <ToolButton editor={editor} title="Bullet list" active={editor.isActive("bulletList")} onRun={() => editor.chain().toggleBulletList().run()}>
          • List
        </ToolButton>
        <ToolButton editor={editor} title="Numbered list" active={editor.isActive("orderedList")} onRun={() => editor.chain().toggleOrderedList().run()}>
          1. List
        </ToolButton>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-[#E8E2D8]" />
        <ToolButton editor={editor} title="Quote" active={editor.isActive("blockquote")} onRun={() => editor.chain().toggleBlockquote().run()}>
          Quote
        </ToolButton>
        <ToolButton editor={editor} title="Inline code" active={editor.isActive("code")} onRun={() => editor.chain().toggleCode().run()}>
          <span className="font-mono">&lt;&gt;</span>
        </ToolButton>
        <ToolButton editor={editor} title="Code block" active={editor.isActive("codeBlock")} onRun={() => editor.chain().toggleCodeBlock().run()}>
          <span className="font-mono">{"{ }"}</span>
        </ToolButton>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-[#E8E2D8]" />
        <ToolButton editor={editor} title="Undo" onRun={() => editor.chain().undo().run()}>
          Undo
        </ToolButton>
        <ToolButton editor={editor} title="Redo" onRun={() => editor.chain().redo().run()}>
          Redo
        </ToolButton>
        <ToolButton editor={editor} title="Clear formatting" onRun={() => editor.chain().clearNodes().unsetAllMarks().run()}>
          Clear
        </ToolButton>
      </div>
      <EditorContent
        editor={editor}
        className="[&_.tiptap]:min-h-[220px] [&_.tiptap]:max-h-[420px] [&_.tiptap]:overflow-y-auto [&_.tiptap]:px-4 [&_.tiptap]:py-3 [&_.tiptap]:text-[14px] [&_.tiptap]:leading-relaxed [&_.tiptap]:text-[#27241F] [&_.tiptap]:outline-none [&_.tiptap_p]:my-2 [&_.tiptap_h2]:mb-1 [&_.tiptap_h2]:mt-4 [&_.tiptap_h2]:text-[17px] [&_.tiptap_h2]:font-bold [&_.tiptap_h2]:text-[#27241F] [&_.tiptap_ul]:my-2 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6 [&_.tiptap_ol]:my-2 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6 [&_.tiptap_li]:my-0.5 [&_.tiptap_blockquote]:my-2 [&_.tiptap_blockquote]:border-l-2 [&_.tiptap_blockquote]:border-[#C9A86A] [&_.tiptap_blockquote]:pl-3 [&_.tiptap_blockquote]:italic [&_.tiptap_blockquote]:text-[#3A352D] [&_.tiptap_code]:rounded [&_.tiptap_code]:bg-[#F5F1E8] [&_.tiptap_code]:px-1 [&_.tiptap_code]:font-mono [&_.tiptap_code]:text-[13px] [&_.tiptap_pre]:my-2 [&_.tiptap_pre]:overflow-x-auto [&_.tiptap_pre]:rounded-lg [&_.tiptap_pre]:bg-[#27241F] [&_.tiptap_pre]:p-3 [&_.tiptap_pre]:font-mono [&_.tiptap_pre]:text-[13px] [&_.tiptap_pre]:text-[#F5F1E8] [&_.tiptap_pre_code]:bg-transparent [&_.tiptap_pre_code]:p-0"
      />
      {hint && <p className="border-t border-[#EFE9DB] bg-[#FBFAF7] px-4 py-1.5 text-[11px] text-[#A39B8E]">{hint}</p>}
    </div>
  );
}
