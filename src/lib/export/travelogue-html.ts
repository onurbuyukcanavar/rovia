import type { Block, Run } from "@/lib/travelogue/pdf/blocks";
import { docToBlocks } from "@/lib/travelogue/pdf/blocks";
import { formatVisit, type BookEntry, type BookModel, type BookPhoto, type BookSection } from "@/lib/travelogue/pdf/model";
import { safeHref } from "@/lib/travelogue/doc";
import { t } from "@/i18n";

/**
 * Seyahatnameyi tek, kendi kendine yeten HTML dosyasına çevirir (saf).
 * Her metin kaçışlıdır; bağlantılar yalnızca http/https/mailto; görseller yalnızca data: adresi.
 * CSP: dış kaynak yüklenmez, betik çalışmaz.
 */
const L = t.travelogue.book;

export type HtmlImage = { src: string; width?: number | null; height?: number | null };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const e = escapeHtml;
/** Yalnızca güvenli raster görsel veri adresleri (SVG değil: betik içerebilir) */
const SAFE_DATA_URL = /^data:image\/(jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/;

function runsHtml(runs: Run[]): string {
  return runs
    .map((r) => {
      if (r.text === "\n") return "<br>";
      let h = e(r.text).replace(/\n/g, "<br>");
      if (r.bold) h = `<strong>${h}</strong>`;
      if (r.italic) h = `<em>${h}</em>`;
      if (r.underline) h = `<u>${h}</u>`;
      const href = r.href ? safeHref(r.href) : null;
      if (href) h = `<a href="${e(href)}" rel="noopener noreferrer">${h}</a>`;
      return h;
    })
    .join("");
}

function imgHtml(mediaId: string, images: Map<string, HtmlImage>, alt: string, cls = ""): string {
  const img = images.get(mediaId);
  if (!img || !SAFE_DATA_URL.test(img.src)) return "";
  const size = img.width && img.height ? ` width="${Math.round(img.width)}" height="${Math.round(img.height)}"` : "";
  return `<img src="${img.src}" alt="${e(alt)}"${size}${cls ? ` class="${cls}"` : ""} loading="lazy">`;
}

function figure(mediaId: string, caption: string | null, images: Map<string, HtmlImage>): string {
  const img = imgHtml(mediaId, images, caption ?? "");
  if (!img) return "";
  return `<figure>${img}${caption ? `<figcaption>${e(caption)}</figcaption>` : ""}</figure>`;
}

export function blocksHtml(blocks: Block[], images: Map<string, HtmlImage>): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "paragraph":
          return `<p>${runsHtml(b.runs)}</p>`;
        case "heading":
          return b.level === 2 ? `<h4>${runsHtml(b.runs)}</h4>` : `<h5>${runsHtml(b.runs)}</h5>`;
        case "list": {
          const items = b.items.map((it) => `<li>${blocksHtml(it, images)}</li>`).join("");
          return b.ordered ? `<ol${b.start !== 1 ? ` start="${b.start}"` : ""}>${items}</ol>` : `<ul>${items}</ul>`;
        }
        case "quote":
          return `<blockquote>${blocksHtml(b.children, images)}</blockquote>`;
        case "hr":
          return "<hr>";
        case "image":
          return figure(b.mediaId, b.caption, images);
      }
    })
    .join("\n");
}

function photos(list: BookPhoto[], images: Map<string, HtmlImage>): string {
  const items = list.map((p) => figure(p.mediaId, p.caption, images)).filter(Boolean);
  if (!items.length) return "";
  return `<div class="${items.length === 1 ? "photo-single" : "photo-grid"}">${items.join("")}</div>`;
}

/** Basit eşdikdörtgen izdüşümlü SVG harita: iz + numaralı yazı işaretleri (dış karo yok) */
function mapSvg(s: Extract<BookSection, { kind: "map" }>): string {
  const pts = [...s.paths.flat(), ...s.markers];
  if (!pts.length) return "";
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180) || 1;
  const W = 800;
  const H = 500;
  const pad = 30;
  const spanX = Math.max((maxLng - minLng) * k, 1e-4);
  const spanY = Math.max(maxLat - minLat, 1e-4);
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const ox = (W - spanX * scale) / 2;
  const oy = (H - spanY * scale) / 2;
  const xy = (p: { lat: number; lng: number }) =>
    `${(ox + (p.lng - minLng) * k * scale).toFixed(1)},${(H - oy - (p.lat - minLat) * scale).toFixed(1)}`;
  const lines = s.paths
    .filter((p) => p.length > 1)
    .map((p) => `<polyline points="${p.map(xy).join(" ")}" fill="none" stroke="#e8912d" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`)
    .join("");
  const markers = s.markers
    .map((m) => {
      const [x, y] = xy(m).split(",");
      return `<a href="#${e(m.anchor)}"><title>${e(m.title)}</title><circle cx="${x}" cy="${y}" r="11" fill="#0e1726" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y}" dy="4" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${m.number}</text></a>`;
    })
    .join("");
  return `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(s.title)}"><rect width="${W}" height="${H}" fill="#f3efe6"/>${lines}${markers}</svg>${s.markers.length ? `<p class="muted">${e(L.mapLegend)}</p>` : ""}`;
}

function entryHtml(be: BookEntry, images: Map<string, HtmlImage>): string {
  const meta = [be.entry.locationName?.trim(), formatVisit(be.entry.visitedAt), be.entry.address?.trim()].filter(Boolean) as string[];
  const fields = be.fields
    .map((f) => `<section class="field"><h4 class="field-label">${e(f.label)}</h4>${blocksHtml(docToBlocks(f.doc), images)}</section>`)
    .join("\n");
  const tags = be.entry.tags.length ? `<p class="tags">${be.entry.tags.map((x) => `<span>${e(x)}</span>`).join(" ")}</p>` : "";
  return `<article class="entry" id="${e(be.anchor)}">
<p class="chapter">${e(L.chapter(be.number))}</p>
<h3>${e(be.title)}</h3>
${meta.length ? `<p class="meta">${meta.map(e).join(" · ")}</p>` : ""}
${tags}
${fields}
${photos(be.photos, images)}
${be.entry.aiAssisted ? `<p class="muted">${e(L.aiAssisted)}</p>` : ""}
</article>`;
}

function sectionHtml(s: BookSection, images: Map<string, HtmlImage>): string {
  switch (s.kind) {
    case "cover":
      return `<header class="cover" id="s-${e(s.id)}">
<p class="brand">${e(L.brand)} · ${e(L.brandTagline)}</p>
<h1>${e(s.title)}</h1>
${s.subtitle ? `<p class="subtitle">${e(s.subtitle)}</p>` : ""}
${s.route ? `<p class="route">${e(s.route)}</p>` : ""}
${s.dateRange ? `<p class="dates">${e(s.dateRange)}</p>` : ""}
${s.coverMediaId ? imgHtml(s.coverMediaId, images, s.title, "cover-img") : ""}
</header>`;
    case "text":
      return `<section id="s-${e(s.id)}"><h2>${e(s.title)}</h2>
${s.purpose ? `<h4 class="field-label">${e(L.purpose)}</h4><p>${e(s.purpose).replace(/\n/g, "<br>")}</p>` : ""}
${s.summary ? `<h4 class="field-label">${e(L.summary)}</h4><p>${e(s.summary).replace(/\n/g, "<br>")}</p>` : ""}
${blocksHtml(docToBlocks(s.content), images)}</section>`;
    case "trip_info":
      return `<section id="s-${e(s.id)}"><h2>${e(s.title)}</h2><dl class="facts">${s.facts.map((f) => `<div><dt>${e(f.label)}</dt><dd>${e(f.value)}</dd></div>`).join("")}</dl></section>`;
    case "map":
      return `<section id="s-${e(s.id)}"><h2>${e(s.title)}</h2>${mapSvg(s)}</section>`;
    case "chronicle":
      return `<section id="s-${e(s.id)}"><h2>${e(s.title)}</h2>${s.entries.map((be) => entryHtml(be, images)).join("\n")}</section>`;
    case "places":
      return `<section id="s-${e(s.id)}"><h2>${e(s.title)}</h2><ol class="places">${s.entries
        .map((be) => `<li><a href="#${e(be.anchor)}">${e(be.title)}</a>${be.entry.address?.trim() ? ` <span class="muted">${e(be.entry.address.trim())}</span>` : ""}</li>`)
        .join("")}</ol></section>`;
    case "gallery":
      return `<section id="s-${e(s.id)}"><h2>${e(s.title)}</h2>${photos(s.photos, images)}</section>`;
  }
}

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fbf8f2;color:#1b2333;font:17px/1.7 "Newsreader","Iowan Old Style","Palatino Linotype","Book Antiqua",Georgia,"DejaVu Serif",serif}
main{max-width:46rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1,h2,h3,h4,h5,.brand,.chapter,.meta,dt,.muted,.toc{font-family:"Manrope","Segoe UI","Helvetica Neue",Arial,"Noto Sans","DejaVu Sans",sans-serif}
h1{font-size:2.6rem;line-height:1.15;margin:.3rem 0}
h2{font-size:1.6rem;margin:3rem 0 1rem;padding-bottom:.4rem;border-bottom:2px solid #e8912d}
h3{font-size:1.35rem;margin:.2rem 0}
h4,h5{font-size:1rem;margin:1.2rem 0 .3rem}
.field-label{color:#8a5a1c;text-transform:uppercase;letter-spacing:.06em;font-size:.75rem}
a{color:#a35d0f}
.cover{text-align:center;padding:2rem 0 1rem}
.brand,.chapter{color:#8a5a1c;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;margin:0}
.subtitle{font-size:1.25rem;font-style:italic;margin:.3rem 0}
.route,.dates{color:#57606f;margin:.2rem 0}
.cover-img{display:block;width:100%;height:auto;margin-top:1.5rem;border-radius:12px}
.meta,.muted{color:#6b7280;font-size:.85rem}
.tags span{display:inline-block;border:1px solid #e3dccd;border-radius:999px;padding:0 .6rem;font-size:.75rem;margin-right:.25rem}
.entry{margin:2.5rem 0;padding-top:1rem;border-top:1px solid #e3dccd;break-inside:auto}
figure{margin:1rem 0;break-inside:avoid}
figure img{display:block;width:100%;height:auto;border-radius:8px}
figcaption{font-size:.85rem;color:#57606f;margin-top:.3rem;text-align:center}
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:.75rem}
.photo-grid figure{margin:0}
.photo-grid img{aspect-ratio:4/3;object-fit:cover}
blockquote{margin:1rem 0;padding:.2rem 1rem;border-left:3px solid #e8912d;color:#3b4252;font-style:italic}
hr{border:0;border-top:1px solid #e3dccd;margin:2rem 0}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(12rem,1fr));gap:.75rem}
.facts div{background:#fff;border:1px solid #e3dccd;border-radius:10px;padding:.6rem .8rem}
dt{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}
dd{margin:0;font-weight:700}
.map{width:100%;height:auto;border-radius:12px;border:1px solid #e3dccd}
.toc ol{padding-left:1.2rem}
.notice{background:#fff7e6;border:1px solid #f0d49b;border-radius:10px;padding:.6rem .9rem;font-size:.9rem}
footer{margin-top:4rem;text-align:center;color:#6b7280;font-size:.8rem}
@media print{
  body{background:#fff;font-size:11.5pt}
  main{max-width:none;padding:0}
  h2{break-before:page;break-after:avoid}
  .cover{min-height:90vh}
  h3,h4{break-after:avoid}
  a{color:inherit;text-decoration:none}
  .toc{break-after:page}
  .notice{display:none}
}
@page{margin:18mm 16mm}
`;

export function renderTravelogueHtml(model: BookModel, images: Map<string, HtmlImage>, opts: { skipped: number; generatedAt: Date }): string {
  const tocItems = model.sections.filter((s) => s.kind !== "cover");
  const toc = tocItems.length > 1
    ? `<nav class="toc" aria-label="${e(L.toc)}"><h2>${e(L.toc)}</h2><ol>${tocItems.map((s) => `<li><a href="#s-${e(s.id)}">${e(s.title)}</a></li>`).join("")}</ol></nav>`
    : "";
  const body = model.sections.length
    ? model.sections.map((s, i) => (i === 0 && s.kind === "cover" ? sectionHtml(s, images) + toc : sectionHtml(s, images))).join("\n")
    : `<h1>${e(model.title)}</h1><p>${e(L.empty)}</p>`;
  const hasCover = model.sections[0]?.kind === "cover";
  const date = opts.generatedAt.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<meta name="referrer" content="no-referrer">
<meta name="generator" content="ROVIA">
<title>${e(model.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${opts.skipped > 0 ? `<p class="notice">${e(t.tools.export.imagesSkipped(opts.skipped))}</p>` : ""}
${hasCover ? "" : `<h1>${e(model.title)}</h1>${model.subtitle ? `<p class="subtitle">${e(model.subtitle)}</p>` : ""}${toc}`}
${body}
<footer>${e(t.tools.export.generated(date))}</footer>
</main>
</body>
</html>
`;
}
