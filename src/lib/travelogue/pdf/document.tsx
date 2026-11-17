import { Fragment, type ReactNode } from "react";
import { Circle, Document, Image as Img, Link, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import { docToBlocks, type Block, type Run } from "./blocks";
import { formatVisit, type BookEntry, type BookModel, type BookPhoto, type BookSection } from "./model";
import { SANS, SERIF } from "./fonts";
import { t } from "@/i18n";

/**
 * Seyahatnamenin PDF belgesi (@react-pdf/renderer). Tarayıcı API'si kullanmaz;
 * görseller önceden JPEG/PNG veri adresine çevrilmiş olarak verilir (bkz. images.ts).
 */
const L = t.travelogue.book;
/** Türkçe büyük harf (i → İ); react-pdf textTransform yerel kuralları uygulamaz. */
const up = (v: string) => v.toLocaleUpperCase("tr-TR");

export type PdfImage = { src: string; width: number; height: number };
export type BookPdfAssets = {
  images: Map<string, PdfImage>;
  /** Rota haritasının durağan görüntüsü (yoksa harita bölümü atlanır) */
  mapImage: PdfImage | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MX = 60;
const CONTENT_W = PAGE_W - MX * 2;
const GAP = 12;
const CELL_W = (CONTENT_W - GAP) / 2;
const CELL_H = Math.round(CELL_W * 0.72);

const C = {
  ink: "#0e1726",
  text: "#1f2430",
  muted: "#6e685f",
  faint: "#8a847a",
  rule: "#d3ccbf",
  sand: "#efebe3",
  paper: "#f7f5f0",
  amber: "#e8912d",
  amberDark: "#9e5912",
};

const s = StyleSheet.create({
  page: { paddingTop: 64, paddingBottom: 78, paddingHorizontal: MX, fontFamily: SERIF, fontSize: 11, color: C.text, backgroundColor: "#ffffff" },
  footer: { position: "absolute", left: MX, right: MX, bottom: 34, flexDirection: "row", justifyContent: "space-between", fontFamily: SANS, fontSize: 7.5, color: C.faint, paddingTop: 7 },
  footerRule: { position: "absolute", left: MX, right: MX, bottom: 52, height: 0.5, backgroundColor: C.rule },
  footerTitle: { maxWidth: CONTENT_W - 60 },
  eyebrow: { fontFamily: SANS, fontWeight: 700, fontSize: 7.5, letterSpacing: 1.6, color: C.amberDark, marginBottom: 6 },
  sectionTitle: { fontFamily: SERIF, fontWeight: 600, fontSize: 28, lineHeight: 1.15, color: C.ink, marginBottom: 6 },
  sectionRule: { width: 44, height: 2, backgroundColor: C.amber, marginTop: 8, marginBottom: 26 },
  chapterTitle: { fontFamily: SERIF, fontWeight: 600, fontSize: 22, lineHeight: 1.2, color: C.ink },
  meta: { fontFamily: SANS, fontSize: 8.5, lineHeight: 1.5, color: C.muted, marginTop: 6 },
  fieldLabel: { fontFamily: SANS, fontWeight: 700, fontSize: 7.5, letterSpacing: 1.3, color: C.muted, marginTop: 18, marginBottom: 6 },
  p: { marginBottom: 8, lineHeight: 1.55, textAlign: "justify" },
  h2: { fontWeight: 600, fontSize: 15, lineHeight: 1.3, color: C.ink, marginTop: 12, marginBottom: 6 },
  h3: { fontWeight: 600, fontSize: 12.5, lineHeight: 1.3, color: C.ink, marginTop: 10, marginBottom: 4 },
  quote: { flexDirection: "row", marginVertical: 6 },
  quoteBar: { width: 2, backgroundColor: C.amber, marginRight: 12 },
  quoteBody: { flex: 1, fontStyle: "italic", color: C.muted },
  rule: { height: 0.5, backgroundColor: C.rule },
  hr: { alignSelf: "center", width: 60, height: 0.75, backgroundColor: C.rule, marginVertical: 14 },
  li: { flexDirection: "row", marginBottom: 2 },
  liMarker: { width: 18, lineHeight: 1.55, color: C.amberDark },
  liBody: { flex: 1 },
  link: { color: C.amberDark, textDecoration: "underline" },
  caption: { fontFamily: SERIF, fontStyle: "italic", fontSize: 9, lineHeight: 1.4, color: C.muted, marginTop: 4, textAlign: "center" },
  figure: { marginVertical: 10, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 14 },
  cell: { width: CELL_W, marginBottom: 12 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  tag: { fontFamily: SANS, fontSize: 7.5, color: C.amberDark, backgroundColor: "#fbf1e3", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4, marginBottom: 4 },
  ai: { fontFamily: SERIF, fontStyle: "italic", fontSize: 8.5, color: C.faint, marginTop: 14 },
  lead: { fontSize: 12.5, lineHeight: 1.6, color: C.text, marginBottom: 10 },
  badge: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.amber, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: SANS, fontWeight: 700, fontSize: 8, color: C.ink, lineHeight: 1 },
});

// ── Zengin metin ─────────────────────────────────────────────────────────────

function runStyle(r: Run): Style {
  const st: Style = {};
  if (r.bold) st.fontWeight = 600;
  if (r.italic) st.fontStyle = "italic";
  if (r.underline) st.textDecoration = "underline";
  return st;
}

function Runs({ runs }: { runs: Run[] }) {
  return runs.map((r, i) =>
    r.href ? (
      <Link key={i} src={r.href} style={[s.link, runStyle(r)]}>{r.text}</Link>
    ) : (
      <Text key={i} style={runStyle(r)}>{r.text}</Text>
    ),
  );
}

/** Görseli verilen kutuya oranını koruyarak sığdırır. */
export function fitBox(w: number, h: number, maxW: number, maxH: number): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: maxW, height: Math.min(maxH, maxW * 0.66) };
  const k = Math.min(maxW / w, maxH / h, 1e9);
  return { width: Math.round(w * k * 100) / 100, height: Math.round(h * k * 100) / 100 };
}

function Figure({ img, caption, maxH = 400 }: { img: PdfImage | undefined; caption: string | null; maxH?: number }) {
  if (!img) return null;
  const box = fitBox(img.width, img.height, CONTENT_W, maxH);
  return (
    <View style={s.figure} wrap={false}>
      <Img src={img.src} style={box} />
      {caption ? <Text style={[s.caption, { maxWidth: CONTENT_W }]}>{caption}</Text> : null}
    </View>
  );
}

function Blocks({ blocks, images }: { blocks: Block[]; images: Map<string, PdfImage> }): ReactNode {
  return blocks.map((b, i) => {
    switch (b.type) {
      case "paragraph":
        return <Text key={i} style={s.p}><Runs runs={b.runs} /></Text>;
      case "heading":
        return <Text key={i} style={b.level === 3 ? s.h3 : s.h2} minPresenceAhead={48}><Runs runs={b.runs} /></Text>;
      case "list":
        return (
          <View key={i} style={{ marginBottom: 8 }}>
            {b.items.map((item, j) => (
              <View key={j} style={s.li}>
                <Text style={s.liMarker}>{b.ordered ? `${b.start + j}.` : "•"}</Text>
                <View style={s.liBody}><Blocks blocks={item} images={images} /></View>
              </View>
            ))}
          </View>
        );
      case "quote":
        return (
          <View key={i} style={s.quote}>
            <View style={s.quoteBar} />
            <View style={s.quoteBody}><Blocks blocks={b.children} images={images} /></View>
          </View>
        );
      case "hr":
        return <View key={i} style={s.hr} />;
      case "image":
        return <Figure key={i} img={images.get(b.mediaId)} caption={b.caption} />;
    }
  });
}

function RichText({ doc, images }: { doc: Parameters<typeof docToBlocks>[0]; images: Map<string, PdfImage> }) {
  return <Blocks blocks={docToBlocks(doc)} images={images} />;
}

// ── Parçalar ─────────────────────────────────────────────────────────────────

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect x={0} y={0} width={64} height={64} rx={16} ry={16} fill={C.ink} />
      <Path d="M17 48c0-9 7.5-11 14.5-12.5S44 31 44 24.5 38 17 31.5 18" fill="none" stroke={C.paper} strokeWidth={5.5} strokeLinecap="round" />
      <Circle cx={17} cy={48} r={3.2} fill={C.ink} stroke={C.paper} strokeWidth={2.6} />
      <Circle cx={44.5} cy={17.5} r={5.2} fill={C.amber} />
    </Svg>
  );
}

function Footer({ title }: { title: string }) {
  return (
    <>
      <View style={s.footerRule} fixed />
      <View style={s.footer} fixed>
        <Text style={s.footerTitle}>{title}</Text>
        <Text render={({ pageNumber }) => L.pageOf(pageNumber)} />
      </View>
    </>
  );
}

function SectionHead({ id, title, eyebrow }: { id: string; title: string; eyebrow?: string }) {
  return (
    <View id={`s-${id}`} minPresenceAhead={120}>
      {eyebrow ? <Text style={s.eyebrow}>{up(eyebrow)}</Text> : null}
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionRule} />
    </View>
  );
}

function PhotoGrid({ photos, images }: { photos: BookPhoto[]; images: Map<string, PdfImage> }) {
  const ready = photos.filter((p) => images.has(p.mediaId));
  if (!ready.length) return null;
  if (ready.length === 1) return <Figure img={images.get(ready[0].mediaId)} caption={ready[0].caption} maxH={360} />;
  return (
    <View style={s.grid}>
      {ready.map((p) => (
        <View key={p.mediaId} style={s.cell} wrap={false}>
          <Img src={images.get(p.mediaId)!.src} style={{ width: CELL_W, height: CELL_H, objectFit: "cover" }} />
          {p.caption ? <Text style={s.caption}>{p.caption}</Text> : null}
        </View>
      ))}
      {ready.length % 2 === 1 ? <View style={s.cell} /> : null}
    </View>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <View style={s.tagRow}>
      {tags.map((tag) => <Text key={tag} style={s.tag}>{tag}</Text>)}
    </View>
  );
}

function entryMeta(be: BookEntry): string[] {
  const e = be.entry;
  const lines: string[] = [];
  const first = [formatVisit(e.visitedAt), e.locationName && e.locationName.trim() !== be.title ? e.locationName.trim() : null].filter(Boolean).join(" · ");
  if (first) lines.push(first);
  if (e.address?.trim()) lines.push(e.address.trim());
  return lines;
}

function Chapter({ be, images, first }: { be: BookEntry; images: Map<string, PdfImage>; first: boolean }) {
  return (
    <View break={!first}>
      <View id={be.anchor} minPresenceAhead={140}>
        <Text style={s.eyebrow}>{up(L.chapter(be.number))}</Text>
        <Text style={s.chapterTitle}>{be.title}</Text>
        {entryMeta(be).map((line, i) => <Text key={i} style={s.meta}>{line}</Text>)}
        <Tags tags={be.entry.tags} />
        <View style={[s.sectionRule, { marginBottom: 14 }]} />
      </View>
      {/* Fragment: alt başlıklar kardeş düğüm olmalı ki minPresenceAhead sayfa sonunda yetim bırakmasın */}
      {be.fields.map((f) => (
        <Fragment key={f.key}>
          <Text style={s.fieldLabel} minPresenceAhead={60}>{up(f.label)}</Text>
          <RichText doc={f.doc} images={images} />
        </Fragment>
      ))}
      <PhotoGrid photos={be.photos} images={images} />
      {be.entry.aiAssisted ? <Text style={s.ai}>{L.aiAssisted}</Text> : null}
    </View>
  );
}

// ── Sayfalar ─────────────────────────────────────────────────────────────────

function CoverPage({ sec, images }: { sec: Extract<BookSection, { kind: "cover" }>; images: Map<string, PdfImage> }) {
  const photo = sec.coverMediaId ? images.get(sec.coverMediaId) : undefined;
  const light = !photo;
  return (
    <Page size="A4" style={{ backgroundColor: light ? C.paper : C.ink, fontFamily: SERIF }}>
      {photo ? <Img src={photo.src} style={{ position: "absolute", top: 0, left: 0, width: PAGE_W, height: PAGE_H - 2, objectFit: "cover" }} /> : null}
      {photo ? <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: PAGE_H * 0.46, backgroundColor: C.ink, opacity: 0.78 }} /> : null}
      <View style={{ position: "absolute", top: 48, left: MX, flexDirection: "row", alignItems: "center" }}>
        <Logo size={26} />
        <Text style={{ fontFamily: SANS, fontWeight: 700, fontSize: 11, letterSpacing: 3, marginLeft: 9, color: light ? C.ink : C.paper }}>{L.brand}</Text>
      </View>
      <View style={{ position: "absolute", left: MX, right: MX, bottom: 70 }}>
        <View style={{ width: 44, height: 2, backgroundColor: C.amber, marginBottom: 18 }} />
        <Text style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 40, lineHeight: 1.1, color: light ? C.ink : "#ffffff" }}>{sec.title}</Text>
        {sec.subtitle ? <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.35, marginTop: 10, color: light ? C.muted : C.sand }}>{sec.subtitle}</Text> : null}
        {sec.route ? <Text style={{ fontFamily: SANS, fontWeight: 700, fontSize: 10, letterSpacing: 0.6, marginTop: 22, color: light ? C.amberDark : C.amber }}>{sec.route}</Text> : null}
        {sec.dateRange ? <Text style={{ fontFamily: SANS, fontSize: 10, marginTop: 4, color: light ? C.muted : C.sand }}>{sec.dateRange}</Text> : null}
      </View>
    </Page>
  );
}

function TocPage({ model }: { model: BookModel }) {
  const items = model.sections.filter((x) => x.kind !== "cover");
  return (
    <Page size="A4" style={s.page}>
      <Text style={s.sectionTitle}>{L.toc}</Text>
      <View style={s.sectionRule} />
      {items.map((sec) => (
        <View key={sec.id} wrap={false}>
          <Link src={`#s-${sec.id}`} style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 13, color: C.ink, textDecoration: "none", marginTop: 8 }}>{sec.title}</Link>
          {sec.kind === "chronicle"
            ? sec.entries.map((be) => (
                <Link key={be.anchor} src={`#${be.anchor}`} style={{ fontSize: 10.5, color: C.muted, textDecoration: "none", marginLeft: 14, marginTop: 2 }}>
                  {`${be.number}. ${be.title}`}
                </Link>
              ))
            : null}
        </View>
      ))}
      <Footer title={model.title} />
    </Page>
  );
}

function SectionPage({ sec, model, assets }: { sec: Exclude<BookSection, { kind: "cover" }>; model: BookModel; assets: BookPdfAssets }) {
  const { images } = assets;
  let body: ReactNode = null;
  switch (sec.kind) {
    case "text":
      body = (
        <>
          {sec.purpose ? <Text style={s.fieldLabel} minPresenceAhead={40}>{up(L.purpose)}</Text> : null}
          {sec.purpose ? <Text style={s.lead}>{sec.purpose}</Text> : null}
          {sec.summary ? <Text style={s.fieldLabel} minPresenceAhead={40}>{up(L.summary)}</Text> : null}
          {sec.summary ? <Text style={[s.p, { marginBottom: 14 }]}>{sec.summary}</Text> : null}
          {sec.content ? <RichText doc={sec.content} images={images} /> : null}
        </>
      );
      break;
    case "trip_info":
      body = (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {sec.facts.map((f) => (
            <View key={f.key} style={{ width: CELL_W, marginBottom: 16 }} wrap={false}>
              <View style={[s.rule, { marginBottom: 8 }]} />
              <Text style={[s.eyebrow, { color: C.muted, marginBottom: 2 }]}>{up(f.label)}</Text>
              <Text style={{ fontSize: 17, lineHeight: 1.3, color: C.ink }}>{f.value}</Text>
            </View>
          ))}
        </View>
      );
      break;
    case "map": {
      const img = assets.mapImage;
      if (!img) return null;
      const box = fitBox(img.width, img.height, CONTENT_W, 470);
      body = (
        <>
          <View wrap={false}>
            <Img src={img.src} style={box} />
            <Text style={[s.meta, { fontSize: 7, marginTop: 4 }]}>{L.mapAttribution}</Text>
          </View>
          {sec.markers.length ? (
            <View style={{ marginTop: 14 }}>
              <Text style={[s.meta, { marginBottom: 8 }]}>{L.mapLegend}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
                {sec.markers.map((m) => (
                  <View key={m.number} style={{ width: CELL_W, flexDirection: "row", alignItems: "center", marginBottom: 5 }} wrap={false}>
                    <View style={[s.badge, { width: 16, height: 16 }]}><Text style={[s.badgeText, { fontSize: 7 }]}>{m.number}</Text></View>
                    <Text style={{ fontSize: 10, marginLeft: 6, flex: 1 }}>{m.title}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      );
      break;
    }
    case "chronicle":
      body = sec.entries.map((be, i) => <Chapter key={be.anchor} be={be} images={images} first={i === 0} />);
      break;
    case "places":
      body = sec.entries.map((be) => {
        const e = be.entry;
        const date = formatVisit(e.visitedAt);
        return (
          <View key={be.anchor} wrap={false}>
          <View style={{ flexDirection: "row", paddingVertical: 9 }}>
            <View style={s.badge}><Text style={s.badgeText}>{be.number}</Text></View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Link src={`#${be.anchor}`} style={{ fontWeight: 600, fontSize: 12, color: C.ink, textDecoration: "none" }}>{be.title}</Link>
              {[e.locationName && e.locationName.trim() !== be.title ? e.locationName.trim() : null, date].filter(Boolean).length ? (
                <Text style={[s.meta, { marginTop: 2 }]}>{[e.locationName && e.locationName.trim() !== be.title ? e.locationName.trim() : null, date].filter(Boolean).join(" · ")}</Text>
              ) : null}
              {e.address?.trim() ? <Text style={[s.meta, { marginTop: 1 }]}>{e.address.trim()}</Text> : null}
              <Tags tags={e.tags} />
            </View>
          </View>
          <View style={s.rule} />
          </View>
        );
      });
      break;
    case "gallery":
      body = <PhotoGrid photos={sec.photos} images={images} />;
      break;
  }
  const eyebrow = sec.kind === "chronicle" ? undefined : model.title;
  return (
    <Page size="A4" style={s.page}>
      <SectionHead id={sec.id} title={sec.title} eyebrow={eyebrow} />
      {body}
      <Footer title={model.title} />
    </Page>
  );
}

/** Kitabın tamamı. TOC, en az iki içerik bölümü varsa eklenir. */
export function BookDocument({ model, assets }: { model: BookModel; assets: BookPdfAssets }) {
  const content = model.sections.filter((x): x is Exclude<BookSection, { kind: "cover" }> => x.kind !== "cover")
    .filter((x) => x.kind !== "map" || assets.mapImage);
  const cover = model.sections.find((x): x is Extract<BookSection, { kind: "cover" }> => x.kind === "cover");
  const withToc = content.length >= 2 || model.entries.length >= 4;
  return (
    <Document title={model.title} author={L.pdf.author} creator={L.pdf.author} producer={L.pdf.author} language="tr">
      {cover ? <CoverPage sec={cover} images={assets.images} /> : null}
      {withToc ? <TocPage model={{ ...model, sections: content }} /> : null}
      {content.map((sec) => <SectionPage key={sec.id} sec={sec} model={model} assets={assets} />)}
      {!cover && !content.length ? (
        <Page size="A4" style={s.page}><Text style={s.sectionTitle}>{model.title}</Text><Text>{L.empty}</Text></Page>
      ) : null}
    </Document>
  );
}
