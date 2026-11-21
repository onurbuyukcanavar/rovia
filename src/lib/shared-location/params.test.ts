import { describe, expect, it } from "vitest";
import { sharedInputFromParams } from "./params";
import { parseSharedLocation } from "./parse";

describe("/konum parametreleri", () => {
  it("lat/lng/label", () => {
    expect(sharedInputFromParams({ lat: "41.0082", lng: "28.9784", label: "Ayasofya" })).toEqual({ text: "41.0082, 28.9784", label: "Ayasofya" });
    expect(sharedInputFromParams({ lat: "x", lng: "1" })).toEqual({ text: "", label: null });
  });

  it("Web Share Target: title + text + url birleştirilir, başlık ad ipucudur", () => {
    const r = sharedInputFromParams({ title: "Galata Kulesi", text: "Buradayım", url: "https://maps.app.goo.gl/abc" });
    expect(r).toEqual({ text: "https://maps.app.goo.gl/abc\nBuradayım", label: "Galata Kulesi" });
    expect(parseSharedLocation(r.text)).toMatchObject({ kind: "resolve" });
  });

  it("Android SEND / geo: intent metni", () => {
    const r = sharedInputFromParams({ text: "geo:0,0?q=41.0256,28.9741(Galata Kulesi)" });
    expect(parseSharedLocation(r.text)).toMatchObject({ kind: "point", lat: 41.0256, label: "Galata Kulesi" });
  });

  it("yalnızca q (yer adı) ve yalnızca başlık", () => {
    expect(sharedInputFromParams({ q: "Ölüdeniz" })).toEqual({ text: "Ölüdeniz", label: null });
    expect(sharedInputFromParams({ title: "Ölüdeniz" })).toEqual({ text: "Ölüdeniz", label: null });
    expect(sharedInputFromParams({ text: ["a", "b"] }).text).toBe("a");
    expect(sharedInputFromParams({})).toEqual({ text: "", label: null });
  });

  it("aynı değer iki kez gelirse tekrar edilmez", () => {
    expect(sharedInputFromParams({ text: "https://x.y/z", url: "https://x.y/z" }).text).toBe("https://x.y/z");
  });
});
