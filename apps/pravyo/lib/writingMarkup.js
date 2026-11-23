/**
 * Student writing is stored as plain text with a tiny inline markup, so it is
 * never rendered as raw HTML (no XSS from user input):
 *
 *   **bold**   _italic_   [link text](https://example.com)   {{highlight}}…{{/highlight}}
 *
 * They nest: the editor writes a link outermost, then bold, then italic, e.g.
 * `[**_text_**](https://…)`. Only http(s) and mailto links are kept; anything
 * else stays plain text.
 *
 * The rich editor (components/writing/RichWritingEditor.js) turns this into
 * what students see while typing, and back.
 */

const TOKEN =
  /(\{\{highlight\}\}[\s\S]*?\{\{\/highlight\}\})|(\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))|(\*\*[^*]+\*\*)|(_[^_]+_)/g;

export function safeWritingHref(value) {
  const href = String(value || "").trim();
  if (!href || href.length > 2000) return "";
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

/** Parse inline markup into nodes: text | bold | italic | link | highlight. */
export function parseWritingInline(text) {
  const source = String(text || "");
  const nodes = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    const [part] = match;
    if (match.index > last) nodes.push({ type: "text", text: source.slice(last, match.index) });
    if (match[1]) {
      nodes.push({ type: "highlight", children: [{ type: "text", text: part.slice(13, -14) }] });
    } else if (match[2]) {
      const split = part.lastIndexOf("](");
      const href = safeWritingHref(part.slice(split + 2, -1));
      const label = part.slice(1, split);
      nodes.push(href
        ? { type: "link", href, children: parseWritingInline(label) }
        : { type: "text", text: part });
    } else if (match[3]) {
      nodes.push({ type: "bold", children: parseWritingInline(part.slice(2, -2)) });
    } else {
      nodes.push({ type: "italic", children: parseWritingInline(part.slice(1, -1)) });
    }
    last = match.index + part.length;
  }
  if (last < source.length) nodes.push({ type: "text", text: source.slice(last) });
  return nodes;
}

/** The words only, without any markup (previews, search, share images). */
export function stripWritingMarkup(content = "") {
  const flatten = (nodes) => nodes.map((node) => (node.type === "text" ? node.text : flatten(node.children))).join("");
  return flatten(parseWritingInline(content));
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function nodesToHtml(nodes) {
  return nodes.map((node) => {
    if (node.type === "text") return escapeHtml(node.text);
    const inner = nodesToHtml(node.children);
    if (node.type === "bold") return `<b>${inner}</b>`;
    if (node.type === "italic") return `<i>${inner}</i>`;
    if (node.type === "link") return `<a href="${escapeHtml(node.href)}">${inner}</a>`;
    return `<mark>${inner}</mark>`;
  }).join("");
}

/** Editor HTML for stored writing: one <div> per line, escaped text. */
export function writingToEditorHtml(content = "") {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  return lines.map((line) => `<div>${line ? nodesToHtml(parseWritingInline(line)) : "<br>"}</div>`).join("");
}

const BLOCKS = new Set(["DIV", "P", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL"]);

/**
 * Stored writing for the editor's DOM. Formatting comes from b/strong, i/em,
 * bold/italic inline styles and links; everything else is plain text.
 */
export function editorNodeToWriting(root) {
  const runs = [];
  const pushText = (text, fmt) => {
    if (!text) return;
    // A line break never sits inside a marker: markup is read line by line.
    if (text.includes("\n")) {
      text.split("\n").forEach((piece, index) => {
        if (index) runs.push({ text: "\n" });
        pushText(piece, fmt);
      });
      return;
    }
    const prev = runs[runs.length - 1];
    if (prev && prev.text !== "\n" && prev.bold === fmt.bold && prev.italic === fmt.italic && prev.href === fmt.href && !prev.highlight === !fmt.highlight) {
      prev.text += text;
    } else {
      runs.push({ text, ...fmt });
    }
  };
  const newline = () => runs.push({ text: "\n" });
  const endsWithNewline = () => !runs.length || runs[runs.length - 1].text === "\n";

  const walk = (node, fmt) => {
    if (node.nodeType === 3) {
      pushText(node.nodeValue.replace(/ /g, " ").replace(/​/g, ""), fmt);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === "BR") {
      newline();
      return;
    }
    const style = node.style || {};
    const weight = String(style.fontWeight || "");
    const next = {
      bold: fmt.bold || tag === "B" || tag === "STRONG" || weight === "bold" || Number(weight) >= 600,
      italic: fmt.italic || tag === "I" || tag === "EM" || style.fontStyle === "italic",
      href: fmt.href || (tag === "A" ? safeWritingHref(node.getAttribute("href")) : ""),
      highlight: fmt.highlight || tag === "MARK",
    };
    const block = BLOCKS.has(tag) && node !== root;
    if (block && !endsWithNewline()) newline();
    node.childNodes.forEach((child) => walk(child, next));
  };
  walk(root, { bold: false, italic: false, href: "", highlight: false });

  return runs.map((run) => {
    if (run.text === "\n") return "\n";
    // Keep spaces outside the markers: "**word** " rather than "**word **".
    const [, lead, core, trail] = run.text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!core) return run.text;
    let out = core;
    if (run.italic) out = `_${out}_`;
    if (run.bold) out = `**${out}**`;
    if (run.highlight) out = `{{highlight}}${out}{{/highlight}}`;
    if (run.href) out = `[${out}](${run.href})`;
    return `${lead}${out}${trail}`;
  }).join("");
}
