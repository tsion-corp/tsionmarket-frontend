import { describe, expect, it } from "vitest";
import { parsePendingPredictionCashouts } from "./pending-cashout";

describe("pending prediction cashouts", () => {
  it("restores valid Dextopus request metadata", () => {
    const item = {
      requestId: "request-1",
      wallet: "0x1111111111111111111111111111111111111111",
      expectedBaseUsdcRaw: "1250000",
      createdAt: 1_788_000_000_000,
      originTxHash: `0x${"ab".repeat(32)}`,
    };
    expect(parsePendingPredictionCashouts(JSON.stringify([item]))).toEqual([item]);
  });

  it("drops malformed or unsafe records", () => {
    expect(
      parsePendingPredictionCashouts(
        JSON.stringify([
          { requestId: "request-1", wallet: "not-a-wallet", expectedBaseUsdcRaw: "1" },
          { requestId: "", wallet: "0x1111111111111111111111111111111111111111" },
        ])
      )
    ).toEqual([]);
  });
});
