import {
  editorNodeToWriting,
  parseWritingInline,
  safeWritingHref,
  stripWritingMarkup,
  writingToEditorHtml,
} from "@/lib/writingMarkup";

// A tiny DOM stand-in: enough of Node for the editor serializer.
const text = (value) => ({ nodeType: 3, nodeValue: value, childNodes: [] });
const el = (tagName, children = [], attrs = {}) => ({
  nodeType: 1,
  tagName,
  style: attrs.style || {},
  getAttribute: (name) => attrs[name] ?? null,
  childNodes: children,
});

describe("writing markup", () => {
  test("parses bold, italic, links and nesting", () => {
    expect(parseWritingInline("a **b** _c_ [d](https://x.org)")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "italic", children: [{ type: "text", text: "c" }] },
      { type: "text", text: " " },
      { type: "link", href: "https://x.org/", children: [{ type: "text", text: "d" }] },
    ]);
    const [link] = parseWritingInline("[**_hi_**](https://x.org/a_b)");
    expect(link.type).toBe("link");
    expect(link.children[0].type).toBe("bold");
    expect(link.children[0].children[0].type).toBe("italic");
  });

  test("never links unsafe addresses", () => {
    expect(safeWritingHref("javascript:alert(1)")).toBe("");
    expect(parseWritingInline("[x](javascript:alert(1))").every((node) => node.type === "text")).toBe(true);
    expect(safeWritingHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  test("strips markup for previews", () => {
    expect(stripWritingMarkup("**Big** _day_ at [school](https://x.org)")).toBe("Big day at school");
  });

  test("escapes text when loading into the editor", () => {
    expect(writingToEditorHtml("<script>x</script>\n\n**b**")).toBe(
      "<div>&lt;script&gt;x&lt;/script&gt;</div><div><br></div><div><b>b</b></div>"
    );
  });

  test("editor content saves back as markup", () => {
    const root = el("DIV", [
      el("DIV", [text("Hello "), el("B", [text("big ")]), text("world")]),
      el("DIV", [el("BR")]),
      el("DIV", [el("I", [text("soft")]), text(" and "), el("A", [el("B", [text("site")])], { href: "https://x.org" })]),
      el("DIV", [el("SPAN", [text("css bold")], { style: { fontWeight: "700" } })]),
    ]);
    expect(editorNodeToWriting(root)).toBe(
      "Hello **big** world\n\n_soft_ and [**site**](https://x.org/)\n**css bold**"
    );
  });

  test("loading then saving keeps the writing unchanged", () => {
    const stored = "Title line\n\nA **bold** and _italic_ word, plus [a link](https://example.com/).";
    // Rebuild the DOM the editor would hold for writingToEditorHtml(stored).
    const lines = stored.split("\n").map((line) => {
      if (!line) return el("DIV", [el("BR")]);
      const toDom = (nodes) => nodes.map((node) => {
        if (node.type === "text") return text(node.text);
        if (node.type === "bold") return el("B", toDom(node.children));
        if (node.type === "italic") return el("I", toDom(node.children));
        return el("A", toDom(node.children), { href: node.href });
      });
      return el("DIV", toDom(parseWritingInline(line)));
    });
    expect(editorNodeToWriting(el("DIV", lines))).toBe(stored);
  });
});
