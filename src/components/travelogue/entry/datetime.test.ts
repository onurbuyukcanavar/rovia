import { describe, expect, it } from "vitest";
import { isoToLocalInput, localInputToIso } from "./datetime";

describe("datetime-local ↔ ISO", () => {
  it("boş ve geçersiz değerler", () => {
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput("bozuk")).toBe("");
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("2026-13-01T10:00")).toBeNull();
    expect(localInputToIso("2026-02-30T10:00")).toBeNull();
  });

  it("saat dilimi farkıyla ISO üretir ve aynı anı temsil eder", () => {
    const iso = localInputToIso("2026-05-01T14:30")!;
    expect(iso).toMatch(/^2026-05-01T14:30:00[+-]\d{2}:\d{2}$/);
    expect(new Date(iso).getTime()).toBe(new Date(2026, 4, 1, 14, 30).getTime());
  });

  it("gidiş-dönüş değeri korur", () => {
    for (const v of ["2026-01-15T00:05", "2026-07-31T23:59", "2025-12-31T12:00"]) {
      expect(isoToLocalInput(localInputToIso(v))).toBe(v);
    }
  });

  it("UTC ISO'yu yerel saate çevirir", () => {
    const d = new Date(Date.UTC(2026, 4, 1, 11, 30));
    expect(isoToLocalInput(d.toISOString())).toBe(
      `2026-05-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    );
  });
});
