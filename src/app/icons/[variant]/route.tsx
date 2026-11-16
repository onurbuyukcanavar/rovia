import { ImageResponse } from "next/og";

const VARIANTS = { "192": { size: 192, pad: 0 }, "512": { size: 512, pad: 0 }, maskable: { size: 512, pad: 0.18 } } as const;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

/** PWA için PNG ikonlar (logo SVG'sinden üretilir). Maskable sürümde güvenli alan boşluğu bırakılır. */
export async function GET(_req: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  const cfg = VARIANTS[variant as keyof typeof VARIANTS];
  if (!cfg) return new Response("Not found", { status: 404 });
  const inner = Math.round(cfg.size * (1 - cfg.pad * 2));
  const radius = cfg.pad ? 0 : Math.round(cfg.size * 0.25);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0e1726", borderRadius: radius }}>
        <svg width={inner} height={inner} viewBox="0 0 64 64">
          <path d="M17 48c0-9 7.5-11 14.5-12.5S44 31 44 24.5 38 17 31.5 18" fill="none" stroke="#f7f5f0" strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="17" cy="48" r="3.2" fill="#0e1726" stroke="#f7f5f0" strokeWidth="2.6" />
          <circle cx="44.5" cy="17.5" r="5.2" fill="#e8912d" />
        </svg>
      </div>
    ),
    { width: cfg.size, height: cfg.size },
  );
}
