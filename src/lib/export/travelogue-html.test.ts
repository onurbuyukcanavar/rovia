import { describe, expect, it } from "vitest";
import { blocksHtml, escapeHtml } from "./travelogue-html";
import type { Block } from "@/lib/travelogue/pdf/blocks";

describe("travelogue HTML", () => {
  it("metni kaçışlar, yalnızca güvenli bağlantı ve raster data: görsel", () => {
    const blocks: Block[] = [
      { type: "paragraph", runs: [{ text: "<script>alert(1)</script>", bold: true }, { text: "x", href: "javascript:alert(1)" }, { text: "y", href: "https://a.b/?q=\"1\"" }] },
      { type: "image", mediaId: "ok", caption: "<b>" },
      { type: "image", mediaId: "svg", caption: null },
      { type: "list", ordered: true, start: 3, items: [[{ type: "paragraph", runs: [{ text: "a" }] }]] },
    ];
    const images = new Map([
      ["ok", { src: "data:image/jpeg;base64,AAAA", width: 10, height: 5 }],
      ["svg", { src: "data:image/svg+xml;base64,PHN2Zz4=" }],
    ]);
    const html = blocksHtml(blocks, images);
    expect(html).toContain("<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<a href="https://a.b/?q=%221%22" rel="noopener noreferrer">y</a>');
    expect(html).toContain('<img src="data:image/jpeg;base64,AAAA" alt="&lt;b&gt;" width="10" height="5"');
    expect(html).not.toContain("svg+xml");
    expect(html).toContain('<ol start="3"><li><p>a</p></li></ol>');
    expect(escapeHtml(`'"&`)).toBe("&#39;&quot;&amp;");
  });
});
