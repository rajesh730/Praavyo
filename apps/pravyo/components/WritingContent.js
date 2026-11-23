import { parseWritingInline, stripWritingMarkup } from "@/lib/writingMarkup";

// Re-exported: existing imports read it from here.
export { stripWritingMarkup };

function renderNodes(nodes, keyPrefix = "w") {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return <span key={key}>{node.text}</span>;
    const children = renderNodes(node.children, key);
    if (node.type === "bold") return <strong key={key}>{children}</strong>;
    if (node.type === "italic") return <em key={key}>{children}</em>;
    if (node.type === "link") {
      return (
        <a
          key={key}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="font-semibold text-brand underline underline-offset-2 hover:text-brand-strong"
        >
          {children}
        </a>
      );
    }
    return (
      <mark key={key} className="rounded-control bg-warning-soft px-1 font-semibold text-ink">
        {children}
      </mark>
    );
  });
}

/** Bold, italic, links and highlights of one piece of writing, safely as React. */
export function InlineWritingText({ text }) {
  return renderNodes(parseWritingInline(text));
}

export function getWritingPreviewText(content = "", maxLength = 160, options = {}) {
  const text = options.preserveFormatting
    ? stripWritingMarkup(content).replace(/\r\n/g, "\n").trim()
    : stripWritingMarkup(content).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

export function WritingPreview({
  content = "",
  maxLength = 160,
  preserveFormatting = true,
  className = "",
}) {
  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {getWritingPreviewText(content, maxLength, { preserveFormatting })}
    </p>
  );
}

export default function WritingContent({ content = "", className = "" }) {
  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      <InlineWritingText text={String(content || "").replace(/\r\n/g, "\n")} />
    </div>
  );
}
