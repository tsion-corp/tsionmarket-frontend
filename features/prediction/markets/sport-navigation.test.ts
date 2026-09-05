import { describe, expect, it } from "vitest";
import { comboLeagueForNavigation } from "./sport-navigation";

describe("prediction sport navigation", () => {
  it("maps Europe's top-five league tabs to provider slugs", () => {
    expect(comboLeagueForNavigation("epl")).toBe("epl");
    expect(comboLeagueForNavigation("serie-a")).toBe("serie-a");
    expect(comboLeagueForNavigation("ligue-1")).toBe("ligue-1");
  });

  it("does not force a league for the top-football tab", () => {
    expect(comboLeagueForNavigation("top")).toBeUndefined();
  });
});
