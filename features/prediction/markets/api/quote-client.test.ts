import { describe, expect, it } from "vitest";
import { WalletType } from "@polymarket/client";
import type { SecureClient } from "@/features/prediction/lib/polymarket/secure-client";
import { buildComboBuyQuoteBody } from "./quote-client";

const wallet = "0x2222222222222222222222222222222222222222";
const client = {
  account: {
    signer: "0x1111111111111111111111111111111111111111",
    wallet,
    walletType: WalletType.DEPOSIT_WALLET,
  },
} as unknown as SecureClient;

describe("Combo BUY quote payload", () => {
  it("uses the Deposit Wallet and exact six-decimal base units", () => {
    expect(
      JSON.parse(
        buildComboBuyQuoteBody(client, {
          legPositionIds: ["123", "456"],
          notionalE6: "100000",
          idempotencyKey: "quote:test",
        })
      )
    ).toEqual({
      signer_address: wallet,
      maker_address: wallet,
      signature_type: 3,
      leg_position_ids: ["123", "456"],
      direction: "BUY",
      side: "YES",
      requested_size: {
        unit: "notional",
        value_e6: "100000",
      },
    });
  });

  it("rejects duplicate legs and non-integer money values", () => {
    expect(() =>
      buildComboBuyQuoteBody(client, {
        legPositionIds: ["123", "123"],
        notionalE6: "100000",
        idempotencyKey: "quote:duplicate",
      })
    ).toThrow("same leg");
    expect(() =>
      buildComboBuyQuoteBody(client, {
        legPositionIds: ["123", "456"],
        notionalE6: "0.1",
        idempotencyKey: "quote:float",
      })
    ).toThrow("positive base-unit integer");
  });
});
