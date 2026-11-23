/**
 * Student writing is stored as plain text with a tiny markup, so it is never
 * rendered as raw HTML (no XSS from user input).
 *
 * Inline:  **bold**   _italic_ (or *italic*)   [link text](https://example.com)
 *          {{highlight}}…{{/highlight}}
 * Lines:   ## Heading        (also #, ### … as pasted from elsewhere)
 *          - bullet item     (also * or + or •)
 *          1. numbered item  (also 1) )
 *
 * Inline marks nest: the editor writes a link outermost, then bold, then
 * italic, e.g. `[**_text_**](https://…)`. Only http(s) and mailto links are
 * kept; anything else stays plain text.
 *
 * The rich editor (components/writing/RichWritingEditor.js) turns this into
 * what students see while typing, and back; components/WritingContent.js
 * renders it for readers.
 */

const TOKEN =
  /(\{\{highlight\}\}[\s\S]*?\{\{\/highlight\}\})|(\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))|(\*\*[^*]+\*\*)|(_[^_]+_)|((?<![*\w])\*(?![\s*])[^*\n]+?(?<![\s*])\*(?![*\w]))/g;

const HEADING_LINE = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const BULLET_LINE = /^\s*[-*+•]\s+(.*)$/;
const NUMBERED_LINE = /^\s*(\d{1,4})[.)]\s+(.*)$/;

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
      // _italic_ or *italic*
      nodes.push({ type: "italic", children: parseWritingInline(part.slice(1, -1)) });
    }
    last = match.index + part.length;
  }
  if (last < source.length) nodes.push({ type: "text", text: source.slice(last) });
  return nodes;
}

/**
 * Split writing into blocks: text runs (kept as written, blank lines and all),
 * headings, bullet lists and numbered lists.
 */
export function parseWritingBlocks(content = "") {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let textLines = [];
  const flushText = () => {
    if (textLines.length) blocks.push({ type: "text", lines: textLines });
    textLines = [];
  };
  for (const line of lines) {
    let match;
    if ((match = line.match(HEADING_LINE)) && match[1]) {
      flushText();
      blocks.push({ type: "heading", text: match[1] });
    } else if ((match = line.match(BULLET_LINE))) {
      flushText();
      const prev = blocks[blocks.length - 1];
      if (prev?.type === "bullets") prev.items.push(match[1]);
      else blocks.push({ type: "bullets", items: [match[1]] });
    } else if ((match = line.match(NUMBERED_LINE))) {
      flushText();
      const prev = blocks[blocks.length - 1];
      if (prev?.type === "numbers") prev.items.push(match[2]);
      else blocks.push({ type: "numbers", start: Number(match[1]) || 1, items: [match[2]] });
    } else {
      textLines.push(line);
    }
  }
  flushText();
  return blocks;
}

/** The words only, without any markup (previews, search, share images). */
export function stripWritingMarkup(content = "") {
  const flatten = (nodes) => nodes.map((node) => (node.type === "text" ? node.text : flatten(node.children))).join("");
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const heading = line.match(HEADING_LINE);
      const bullet = !heading && line.match(BULLET_LINE);
      const body = heading ? heading[1] : bullet ? `• ${bullet[1]}` : line;
      return flatten(parseWritingInline(body));
    })
    .join("\n");
}

/**
 * Text pasted from elsewhere (ChatGPT, notes apps, Markdown) in our markup:
 * headings, bullets and numbers become lines the editor shows as such.
 */
export function pastedTextToWriting(text = "") {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      let match;
      if ((match = line.match(HEADING_LINE)) && match[1]) return `## ${match[1]}`;
      if ((match = line.match(BULLET_LINE))) return `- ${match[1]}`;
      if ((match = line.match(NUMBERED_LINE))) return `${match[1]}. ${match[2]}`;
      return line;
    })
    .join("\n")
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, "**_$1_**")
    .replace(/(^|[^\w_])__([^_\n]+)__(?![\w_])/g, "$1**$2**");
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

/** Inline HTML for one line of writing (escaped). */
export function writingLineToHtml(line = "") {
  return nodesToHtml(parseWritingInline(line));
}

/** Editor HTML for stored writing: one <div> per line, lists and headings as such. */
export function writingToEditorHtml(content = "") {
  return parseWritingBlocks(content).map((block) => {
    if (block.type === "heading") return `<h3>${writingLineToHtml(block.text)}</h3>`;
    if (block.type === "bullets") {
      return `<ul>${block.items.map((item) => `<li>${writingLineToHtml(item) || "<br>"}</li>`).join("")}</ul>`;
    }
    if (block.type === "numbers") {
      const start = block.start > 1 ? ` start="${block.start}"` : "";
      return `<ol${start}>${block.items.map((item) => `<li>${writingLineToHtml(item) || "<br>"}</li>`).join("")}</ol>`;
    }
    return block.lines.map((line) => `<div>${line ? writingLineToHtml(line) : "<br>"}</div>`).join("");
  }).join("");
}

const BLOCKS = new Set(["DIV", "P", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "TABLE", "TR", "SECTION", "ARTICLE", "HEADER", "FOOTER", "PRE", "DL", "DT", "DD"]);
const SKIP = new Set(["STYLE", "SCRIPT", "HEAD", "TITLE", "META", "LINK", "NOSCRIPT", "TEMPLATE", "SVG", "IMG", "VIDEO", "AUDIO", "IFRAME", "OBJECT", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

function isBoldElement(tag, style) {
  const weight = String(style.fontWeight || "").toLowerCase();
  // Google Docs wraps whole pastes in <b style="font-weight:normal">.
  if (weight === "normal" || weight === "400" || weight === "lighter") return false;
  return tag === "B" || tag === "STRONG" || weight === "bold" || weight === "bolder" || Number(weight) >= 600;
}

/** Last child that is not blank text: a trailing <br> there is only a placeholder. */
function isPlaceholderBreak(node) {
  const siblings = Array.from(node.parentNode?.childNodes || []);
  for (let index = siblings.length - 1; index >= 0; index -= 1) {
    const sibling = siblings[index];
    if (sibling.nodeType === 3 && !String(sibling.nodeValue || "").trim()) continue;
    return sibling === node;
  }
  return false;
}

function runsToMarkup(runs) {
  return runs.map((run) => {
    if (run.raw) return run.text;
    // Keep spaces outside the markers: "**word** " rather than "**word **".
    const [, lead, core, trail] = run.text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!core) return run.text;
    let value = core;
    if (run.italic) value = `_${value}_`;
    if (run.bold) value = `**${value}**`;
    if (run.highlight) value = `{{highlight}}${value}{{/highlight}}`;
    if (run.href) value = `[${value}](${run.href})`;
    return `${lead}${value}${trail}`;
  }).join("");
}

/**
 * Stored writing for the editor's DOM (or for pasted HTML, with
 * `{ pasted: true }`). Formatting comes from b/strong, i/em, bold/italic
 * inline styles, links, lists and headings; everything else is plain text.
 *
 * Built line by line: every block (div, p, li, heading) starts its own line,
 * and a trailing <br> in a block is only a placeholder, so loading and saving
 * the same writing never adds or loses blank lines.
 */
export function editorNodeToWriting(root, { pasted = false } = {}) {
  const lines = [[]];
  let needBreak = false;
  const current = () => lines[lines.length - 1];
  const breakLine = () => {
    lines.push([]);
    needBreak = false;
  };
  const startBlock = () => {
    if (current().length || needBreak) breakLine();
  };
  // Pasted paragraphs, lists and headings get a blank line before them.
  const blankLineBefore = () => {
    const hasContent = lines.some((line) => line.length);
    if (!hasContent) return;
    if (current().length || needBreak) breakLine();
    if (lines.length < 2 || lines[lines.length - 2].length) breakLine();
  };
  const pushText = (text, fmt) => {
    if (!text) return;
    if (text.includes("\n")) {
      text.split("\n").forEach((piece, index) => {
        if (index) breakLine();
        pushText(piece, fmt);
      });
      return;
    }
    if (needBreak) breakLine();
    const line = current();
    const prev = line[line.length - 1];
    if (prev && !prev.raw && !fmt.raw && prev.bold === fmt.bold && prev.italic === fmt.italic && prev.href === fmt.href && !prev.highlight === !fmt.highlight) {
      prev.text += text;
    } else {
      line.push({ text, ...fmt });
    }
  };
  const pushRaw = (text) => {
    if (needBreak) breakLine();
    current().push({ text, raw: true });
  };

  const walk = (node, fmt, list) => {
    if (node.nodeType === 3) {
      let value = String(node.nodeValue || "").replace(/\u00a0/g, " ").replace(/\u200b/g, "");
      if (pasted) {
        value = value.replace(/\s+/g, " ");
        // Indentation between pasted blocks is not text.
        if (!value.trim() && (needBreak || !current().length)) return;
      }
      pushText(value, fmt);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = String(node.tagName || "").toUpperCase();
    if (SKIP.has(tag)) return;
    if (tag === "BR") {
      if (!isPlaceholderBreak(node)) breakLine();
      return;
    }
    const style = node.style || {};
    const next = {
      bold: (fmt.bold || isBoldElement(tag, style)) && !HEADINGS.has(tag),
      italic: fmt.italic || tag === "I" || tag === "EM" || style.fontStyle === "italic",
      href: fmt.href || (tag === "A" ? safeWritingHref(node.getAttribute?.("href")) : ""),
      highlight: fmt.highlight || tag === "MARK",
    };
    const children = Array.from(node.childNodes || []);

    if (tag === "UL" || tag === "OL") {
      if (pasted) blankLineBefore();
      else if (current().length) needBreak = true;
      const start = Number(node.getAttribute?.("start")) || 1;
      const ctx = { type: tag, n: start - 1 };
      children.forEach((child) => walk(child, next, ctx));
      needBreak = true;
      return;
    }
    if (tag === "LI") {
      startBlock();
      const ctx = list || { type: "UL", n: 0 };
      ctx.n += 1;
      pushRaw(ctx.type === "OL" ? `${ctx.n}. ` : "- ");
      children.forEach((child) => walk(child, next, null));
      needBreak = true;
      return;
    }
    if (HEADINGS.has(tag)) {
      if (pasted) blankLineBefore();
      else startBlock();
      pushRaw("## ");
      children.forEach((child) => walk(child, { ...next, bold: false }, null));
      needBreak = true;
      return;
    }

    const block = BLOCKS.has(tag) && node !== root;
    if (block) {
      if (pasted && tag === "P") blankLineBefore();
      else startBlock();
    }
    children.forEach((child) => walk(child, next, list));
    if (block) needBreak = true;
  };
  walk(root, { bold: false, italic: false, href: "", highlight: false }, null);

  let out = lines.map(runsToMarkup).join("\n");
  if (pasted) {
    out = out
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return out;
}
