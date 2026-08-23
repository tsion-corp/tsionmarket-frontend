import { describe, expect, it } from "vitest";
import { COUNTRY_OPTIONS, countryOption } from "./country-options";

describe("leaderboard country options", () => {
  it("provides a complete searchable ISO country list", () => {
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(240);
    expect(countryOption("NG")).toMatchObject({
      code: "NG",
      name: "Nigeria",
      flag: "🇳🇬",
    });
  });

  it("normalizes country codes and rejects unknown values", () => {
    expect(countryOption(" ng ")?.code).toBe("NG");
    expect(countryOption("ZZ")).toBeNull();
  });
});
