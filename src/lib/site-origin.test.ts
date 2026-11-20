import { describe, expect, it } from "vitest";
import { pickSiteOrigin } from "./site-origin";

const P = "https://www.roviaroad.com";
describe("pickSiteOrigin", () => {
  it("bilinen alan adından gelen istek o adrese döner", () => {
    expect(pickSiteOrigin(P, "rovia-seven.vercel.app")).toBe("https://rovia-seven.vercel.app");
    expect(pickSiteOrigin(P, "www.roviaroad.com")).toBe(P);
  });
  it("bilinmeyen ya da sahte Host birincil adrese düşer", () => {
    expect(pickSiteOrigin(P, "evil.example")).toBe(P);
    expect(pickSiteOrigin(P, "rovia-seven.vercel.app.evil.example")).toBe(P);
    expect(pickSiteOrigin(P, null)).toBe(P);
  });
  it("sondaki eğik çizgi ve büyük harf sorun olmaz", () => {
    expect(pickSiteOrigin(`${P}/`, "WWW.ROVIAROAD.COM")).toBe(P);
  });
});
