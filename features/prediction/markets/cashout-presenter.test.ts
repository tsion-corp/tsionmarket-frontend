import { describe, expect, it } from "vitest";
import { activeCashoutPositions } from "./cashout-presenter";

describe("cashout active bets", () => {
  it("keeps open positions and excludes resolved or empty positions", () => {
    const positions = [
      { title: "Open", size: "2", redeemable: false },
      { title: "Resolved", size: "2", redeemable: true },
      { title: "Empty", size: "0", redeemable: false },
    ];
    expect(activeCashoutPositions(positions).map(({ title }) => title)).toEqual(["Open"]);
  });
});
