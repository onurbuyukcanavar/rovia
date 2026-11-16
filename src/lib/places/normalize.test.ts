import { describe, expect, it } from "vitest";
import cases from "../../../tests/fixtures/normalize-cases.json";
import { normalizeForSearch } from "./normalize";

describe("normalizeForSearch (Python ile ortak vakalar)", () => {
  it.each(cases as [string, string][])("%s → %s", (input, expected) => {
    expect(normalizeForSearch(input)).toBe(expected);
  });
});
