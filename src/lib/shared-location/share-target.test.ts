import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { sharedInputFromParams } from "./params";

describe("PWA Web Share Target", () => {
  it("paylaşım menüsü /konum'a GET ile title/text/url gönderir", () => {
    const m = manifest();
    expect(m.share_target).toEqual({ action: "/konum", method: "GET", params: { title: "title", text: "text", url: "url" } });
    // Tarayıcının oluşturacağı adres sayfanın beklediği parametrelerle aynı adlara sahip
    const q = new URL("https://www.roviaroad.com/konum?title=Ayasofya&text=Burada&url=https%3A%2F%2Fmaps.google.com%2F%3Fq%3D41.0086%2C28.9802");
    expect(sharedInputFromParams(Object.fromEntries(q.searchParams))).toEqual({
      text: "https://maps.google.com/?q=41.0086,28.9802\nBurada", label: "Ayasofya",
    });
  });
});
