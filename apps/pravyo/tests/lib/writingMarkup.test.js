import {
  editorNodeToWriting,
  parseWritingBlocks,
  parseWritingInline,
  pastedTextToWriting,
  safeWritingHref,
  stripWritingMarkup,
  writingToEditorHtml,
} from "@/lib/writingMarkup";

// A tiny DOM stand-in: enough of Node for the serializer.
const text = (value) => ({ nodeType: 3, nodeValue: value, childNodes: [] });
const el = (tagName, children = [], attrs = {}) => {
  const node = {
    nodeType: 1,
    tagName,
    style: attrs.style || {},
    getAttribute: (name) => attrs[name] ?? null,
    childNodes: children,
  };
  children.forEach((child) => {
    child.parentNode = node;
  });
  return node;
};

/** Build the DOM the editor holds for some HTML produced by writingToEditorHtml. */
function domFromEditorHtml(html) {
  const root = el("DIV", []);
  const stack = [root];
  const pattern = /<(\/?)(\w+)([^>]*)>|([^<]+)/g;
  for (const [, closing, tag, attrs, raw] of html.matchAll(pattern)) {
    const parent = stack[stack.length - 1];
    if (raw) {
      const value = raw.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      const node = text(value);
      node.parentNode = parent;
      parent.childNodes.push(node);
    } else if (closing) {
      stack.pop();
    } else {
      const found = {};
      for (const [, name, value] of String(attrs).matchAll(/(\w+)="([^"]*)"/g)) found[name] = value.replace(/&amp;/g, "&");
      const node = el(tag.toUpperCase(), [], found);
      node.parentNode = parent;
      parent.childNodes.push(node);
      if (tag.toLowerCase() !== "br") stack.push(node);
    }
  }
  return root;
}

const roundTrip = (stored) => editorNodeToWriting(domFromEditorHtml(writingToEditorHtml(stored)));

describe("writing markup", () => {
  test("parses bold, italic (both styles), links and nesting", () => {
    expect(parseWritingInline("a **b** _c_ *d* [e](https://x.org)").map((node) => node.type)).toEqual([
      "text", "bold", "text", "italic", "text", "italic", "text", "link",
    ]);
    const [link] = parseWritingInline("[**_hi_**](https://x.org/a_b)");
    expect(link.children[0].type).toBe("bold");
    expect(link.children[0].children[0].type).toBe("italic");
    // Arithmetic is not italic.
    expect(parseWritingInline("5 * 3 * 2").every((node) => node.type === "text")).toBe(true);
  });

  test("never links unsafe addresses", () => {
    expect(safeWritingHref("javascript:alert(1)")).toBe("");
    expect(parseWritingInline("[x](javascript:alert(1))").every((node) => node.type === "text")).toBe(true);
    expect(safeWritingHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  test("reads headings and lists as blocks", () => {
    const blocks = parseWritingBlocks("### Can Technology Replace Teachers?\nText\n- one\n* two\n1. first\n2) second");
    expect(blocks).toEqual([
      { type: "heading", text: "Can Technology Replace Teachers?" },
      { type: "text", lines: ["Text"] },
      { type: "bullets", items: ["one", "two"] },
      { type: "numbers", start: 1, items: ["first", "second"] },
    ]);
  });

  test("strips markup for previews", () => {
    expect(stripWritingMarkup("## Title\n**Big** *day* at [school](https://x.org)\n- item")).toBe(
      "Title\nBig day at school\n• item"
    );
  });

  test("escapes text when loading into the editor", () => {
    expect(writingToEditorHtml("<script>x</script>\n\n**b**")).toBe(
      "<div>&lt;script&gt;x&lt;/script&gt;</div><div><br></div><div><b>b</b></div>"
    );
    expect(writingToEditorHtml("## T\n- a\n- b\n3. c")).toBe("<h3>T</h3><ul><li>a</li><li>b</li></ul><ol start=\"3\"><li>c</li></ol>");
  });

  test("editor content saves back as markup", () => {
    const root = el("DIV", [
      el("DIV", [text("Hello "), el("B", [text("big ")]), text("world")]),
      el("DIV", [el("BR")]),
      el("H3", [text("A heading")]),
      el("UL", [el("LI", [text("apple")]), el("LI", [el("I", [text("pear")])])]),
      el("OL", [el("LI", [text("first")]), el("LI", [text("second")])]),
      el("DIV", [el("A", [el("B", [text("site")])], { href: "https://x.org" })]),
    ]);
    expect(editorNodeToWriting(root)).toBe(
      "Hello **big** world\n\n## A heading\n- apple\n- _pear_\n1. first\n2. second\n[**site**](https://x.org/)"
    );
  });

  test("loading then saving never changes the writing (no growing blank lines)", () => {
    for (const stored of [
      "Title line\n\nA **bold** and _italic_ word, plus [a link](https://example.com/).",
      "Ends with a blank line\n",
      "\nStarts with a blank line",
      "## Heading\nText under it\n\n- one\n- two\n\n1. a\n2. b",
      "List at the end\n- x\n- y",
    ]) {
      expect(roundTrip(stored)).toBe(stored);
      expect(roundTrip(roundTrip(stored))).toBe(stored);
    }
  });

  test("pasted Markdown text becomes formatting", () => {
    expect(pastedTextToWriting("### Conclusion\n* point\n• dot\n1) one\n***both***")).toBe(
      "## Conclusion\n- point\n- dot\n1. one\n**_both_**"
    );
  });

  test("pasted HTML keeps bold, italic, headings and lists only", () => {
    // Google Docs wraps everything in <b style="font-weight:normal">.
    const doc = el("BODY", [
      el("B", [
        el("H2", [text("My Day")]),
        el("P", [text("I went "), el("SPAN", [text("home")], { style: { fontWeight: "700" } }), text(" early.")]),
        el("P", [el("SPAN", [text("It was fun")], { style: { fontStyle: "italic" } })]),
        el("UL", [text("\n  "), el("LI", [text("tea")]), text("\n  "), el("LI", [text("cake")]), text("\n")]),
        el("STYLE", [text("p { color: red }")]),
      ], { style: { fontWeight: "normal" } }),
    ]);
    expect(editorNodeToWriting(doc, { pasted: true })).toBe(
      "## My Day\n\nI went **home** early.\n\n_It was fun_\n\n- tea\n- cake"
    );
  });
});
