import { parseWritingBlocks, parseWritingInline, stripWritingMarkup } from "@/lib/writingMarkup";

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

/** Text lines next to a heading or list lose the blank lines the block replaces. */
function trimBlankEdges(lines, trimStart, trimEnd) {
  let start = 0;
  let end = lines.length;
  if (trimStart) while (start < end && !lines[start].trim()) start += 1;
  if (trimEnd) while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}

/** Headings, bullet lists, numbered lists and text, as written. */
export function WritingBlocks({ content = "" }) {
  const blocks = parseWritingBlocks(content);
  return blocks.map((block, index) => {
    const key = `b-${index}`;
    if (block.type === "heading") {
      return (
        <h3 key={key} className="mb-1 mt-3 whitespace-normal text-[1.15em] font-bold leading-snug text-ink first:mt-0">
          <InlineWritingText text={block.text} />
        </h3>
      );
    }
    if (block.type === "bullets" || block.type === "numbers") {
      const List = block.type === "bullets" ? "ul" : "ol";
      return (
        <List
          key={key}
          start={block.type === "numbers" && block.start > 1 ? block.start : undefined}
          className={`my-2 space-y-1 whitespace-normal pl-6 ${block.type === "bullets" ? "list-disc" : "list-decimal"}`}
        >
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`} className="pl-1">
              <InlineWritingText text={item} />
            </li>
          ))}
        </List>
      );
    }
    const lines = trimBlankEdges(block.lines, index > 0, index < blocks.length - 1);
    if (!lines.length) return null;
    return (
      <div key={key} className="whitespace-pre-wrap">
        <InlineWritingText text={lines.join("\n")} />
      </div>
    );
  });
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
      <WritingBlocks content={content} />
    </div>
  );
}
