import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0e1726" }}>
        <svg width="150" height="150" viewBox="0 0 64 64">
          <path d="M17 48c0-9 7.5-11 14.5-12.5S44 31 44 24.5 38 17 31.5 18" fill="none" stroke="#f7f5f0" strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="17" cy="48" r="3.2" fill="#0e1726" stroke="#f7f5f0" strokeWidth="2.6" />
          <circle cx="44.5" cy="17.5" r="5.2" fill="#e8912d" />
        </svg>
      </div>
    ),
    size,
  );
}
