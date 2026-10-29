import { describe, expect, it } from "vitest";
import { easterSunday } from "./easter";

describe("easterSunday", () => {
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2028, "2028-04-16"],
    [2029, "2029-04-01"],
    [2030, "2030-04-21"],
    [2038, "2038-04-25"],
  ])("Páscoa de %i é %s", (year, expected) => {
    expect(easterSunday(year)).toBe(expected);
  });
});
