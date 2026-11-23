"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Italic, Link2, Unlink } from "lucide-react";
import { editorNodeToWriting, safeWritingHref, writingToEditorHtml } from "@/lib/writingMarkup";

/**
 * A very small "like Word" editor for students: select words and press B, I or
 * Link (or Ctrl+B / Ctrl+I / Ctrl+K). What they see is what readers see.
 *
 * The value stays the plain-text markup the rest of Praavyo already stores and
 * renders safely (lib/writingMarkup.js): **bold**, _italic_, [text](url). The
 * editor only ever contains its own escaped HTML; pasted content is inserted as
 * plain text, so no outside formatting or scripts get in.
 */

function exec(command, value = null) {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
}

function normaliseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return safeWritingHref(raw);
  if (raw.includes("@") && !raw.includes("/")) return safeWritingHref(`mailto:${raw}`);
  return safeWritingHref(`https://${raw}`);
}

function ToolButton({ label, shortcut, on = false, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      // Keep the selection: a normal click would move focus off the words.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-control px-2.5 text-sm font-semibold transition-colors ${
        on ? "bg-brand text-white" : "text-ink hover:bg-surface-2"
      } disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

export default function RichWritingEditor({
  value = "",
  onChange,
  placeholder = "Start writing here...",
  maxLength = 50000,
  disabled = false,
  className = "",
  minHeightClass = "min-h-[340px]",
  ariaLabel = "Writing",
}) {
  const editorRef = useRef(null);
  const lastValue = useRef(null);
  const savedRange = useRef(null);
  const linkInputRef = useRef(null);
  const [active, setActive] = useState({ bold: false, italic: false, link: false });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");

  // Load outside values (opening another writing, clearing after send). Our
  // own edits are skipped so the caret never jumps while typing.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastValue.current) return;
    editor.innerHTML = writingToEditorHtml(value);
    lastValue.current = value;
  }, [value]);

  useEffect(() => {
    exec("styleWithCSS", false);
    exec("defaultParagraphSeparator", "div");
  }, []);

  const emit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = editorNodeToWriting(editor);
    lastValue.current = next;
    onChange?.(next);
  }, [onChange]);

  const selectionInEditor = useCallback(() => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return editorRef.current?.contains(range.commonAncestorContainer) ? range : null;
  }, []);

  const linkAtSelection = useCallback(() => {
    const range = selectionInEditor();
    let node = range?.commonAncestorContainer || null;
    while (node && node !== editorRef.current) {
      if (node.nodeType === 1 && node.tagName === "A") return node;
      node = node.parentNode;
    }
    return null;
  }, [selectionInEditor]);

  const refreshActive = useCallback(() => {
    if (!selectionInEditor()) return;
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      link: Boolean(linkAtSelection()),
    });
  }, [linkAtSelection, selectionInEditor]);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshActive);
    return () => document.removeEventListener("selectionchange", refreshActive);
  }, [refreshActive]);

  const selectNode = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const format = (command) => {
    if (disabled) return;
    editorRef.current?.focus();
    exec(command);
    emit();
    refreshActive();
  };

  const openLink = () => {
    if (disabled) return;
    if (!selectionInEditor()) editorRef.current?.focus();
    savedRange.current = selectionInEditor()?.cloneRange() || null;
    const current = linkAtSelection();
    setLinkUrl(current?.getAttribute("href") || "");
    setLinkError("");
    setLinkOpen(true);
    setTimeout(() => linkInputRef.current?.focus(), 0);
  };

  const restoreSelection = () => {
    editorRef.current?.focus();
    if (savedRange.current) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
  };

  const applyLink = (event) => {
    event?.preventDefault();
    const href = normaliseUrl(linkUrl);
    if (!href) {
      setLinkError("Type a web address, for example www.example.com");
      return;
    }
    restoreSelection();
    // Caret inside an existing link: change that whole link.
    const existing = linkAtSelection();
    if (existing && selectionInEditor()?.collapsed) selectNode(existing);
    const range = selectionInEditor();
    if (range && !range.collapsed) {
      exec("createLink", href);
    } else {
      // Nothing selected: the address itself becomes the linked words.
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.textContent = String(linkUrl).trim();
      exec("insertHTML", anchor.outerHTML);
    }
    setLinkOpen(false);
    emit();
    refreshActive();
  };

  const removeLink = () => {
    restoreSelection();
    const link = linkAtSelection();
    if (link) selectNode(link);
    exec("unlink");
    setLinkOpen(false);
    emit();
    refreshActive();
  };

  const onKeyDown = (event) => {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === "k") {
      event.preventDefault();
      openLink();
    } else if (mod && (key === "b" || key === "i")) {
      event.preventDefault();
      format(key === "b" ? "bold" : "italic");
    } else if (mod && key === "u") {
      event.preventDefault(); // underline is not offered (it would not be saved)
    }
  };

  // Paste as plain text only: no outside formatting, images or code.
  const onPaste = (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    const room = maxLength - (lastValue.current || "").length;
    if (room <= 0) return;
    exec("insertText", text.slice(0, room));
    emit();
  };

  const onBeforeInput = (event) => {
    const inserting = String(event.nativeEvent?.inputType || "").startsWith("insert");
    if (inserting && (lastValue.current || "").length >= maxLength) event.preventDefault();
  };

  const length = (value || "").length;
  const empty = !String(value || "").trim();

  return (
    <div className={`relative ${className}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface px-3 py-1.5" role="toolbar" aria-label="Text style">
        <ToolButton disabled={disabled} label="Bold" shortcut="Ctrl+B" on={active.bold} onClick={() => format("bold")}>
          <Bold size={17} aria-hidden strokeWidth={2.75} />
        </ToolButton>
        <ToolButton disabled={disabled} label="Italic" shortcut="Ctrl+I" on={active.italic} onClick={() => format("italic")}>
          <Italic size={17} aria-hidden />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <ToolButton disabled={disabled} label={active.link ? "Change link" : "Add link"} shortcut="Ctrl+K" on={active.link} onClick={openLink}>
          <Link2 size={17} aria-hidden />
          <span className="hidden sm:inline">Link</span>
        </ToolButton>
        {active.link && (
          <ToolButton disabled={disabled} label="Remove link" onClick={removeLink}>
            <Unlink size={17} aria-hidden />
          </ToolButton>
        )}
        <span className="ml-auto hidden text-xs text-muted md:inline">Select words, then press B, I or Link</span>
      </div>

      {linkOpen && (
        <form onSubmit={applyLink} className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
          <label className="sr-only" htmlFor="rich-writing-link">Web address</label>
          <input
            id="rich-writing-link"
            ref={linkInputRef}
            type="text"
            inputMode="url"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setLinkOpen(false);
            }}
            placeholder="Paste or type a web address, e.g. www.example.com"
            className="input min-w-0 flex-1 py-1.5 text-sm"
          />
          <button type="submit" className="btn btn-primary btn-sm">{active.link ? "Update link" : "Add link"}</button>
          <button type="button" onClick={() => setLinkOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
          {linkError && <p className="w-full text-xs text-danger">{linkError}</p>}
        </form>
      )}

      <div className="relative">
        {empty && (
          <span className="pointer-events-none absolute left-5 top-4 text-base leading-8 text-subtle" aria-hidden>
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          onKeyDown={onKeyDown}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          onPaste={onPaste}
          onDrop={(event) => event.preventDefault()}
          onBeforeInput={onBeforeInput}
          className={`block w-full whitespace-pre-wrap break-words px-5 pb-10 pt-4 text-base leading-8 text-ink outline-none [&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_mark]:rounded-control [&_mark]:bg-warning-soft [&_mark]:px-1 ${minHeightClass}`}
        />
        <span className={`pointer-events-none absolute bottom-3 right-5 rounded-full bg-surface px-2 text-xs font-semibold ${length > maxLength ? "text-danger" : "text-muted"}`}>
          {length} / {maxLength}
        </span>
      </div>
    </div>
  );
}
