import { describe, expect, it } from "vitest";
import { parseSportsbookSlip } from "./slip-store";

describe("sportsbook slip persistence", () => {
  it("accepts a valid persisted selection", () => {
    const value = parseSportsbookSlip(
      JSON.stringify({
        stake: "5",
        denomination: "USDC",
        selections: [
          {
            id: "10:20",
            eventId: "1",
            eventTitle: "Home v Away",
            eventKind: "sports",
            conditionId: "10",
            marketTitle: "Winner",
            outcomeId: "20",
            outcomeTitle: "Home",
            odds: "1.95",
            expressForbidden: false,
          },
        ],
      })
    );
    expect(value.selections).toHaveLength(1);
    expect(value.stake).toBe("5");
  });

  it("keeps old selections but resets a legacy WETH stake to USDC", () => {
    const value = parseSportsbookSlip(
      JSON.stringify({
        stake: "0.001",
        selections: [
          {
            id: "10:20",
            eventId: "1",
            eventTitle: "Home v Away",
            eventKind: "sports",
            conditionId: "10",
            marketTitle: "Winner",
            outcomeId: "20",
            outcomeTitle: "Home",
            odds: "1.95",
            expressForbidden: false,
          },
        ],
      })
    );
    expect(value.selections).toHaveLength(1);
    expect(value.stake).toBe("2");
    expect(value.denomination).toBe("USDC");
  });

  it("drops malformed storage instead of trusting it", () => {
    expect(parseSportsbookSlip('{"stake":7}').selections).toEqual([]);
  });
});
