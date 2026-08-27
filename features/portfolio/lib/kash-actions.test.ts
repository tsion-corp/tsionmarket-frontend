import { beforeEach, describe, expect, it, vi } from "vitest";

// `post` goes through apiFetch, which demands a Privy token and never reaches
// the network in a unit test. Mocking the transport keeps these assertions on
// what this layer is responsible for: what it puts on the wire.
const apiFetchMock = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }));

import {
  newConversionKey,
  postKashClaim,
  postKashConversion,
  postKashPurchase,
  postKashSubscribe,
} from "./kash";
import { usdcAmountForPrice, usdcToAtomic, usdcTransferData } from "./kash-transfer";

const WALLET = "0xe03a10efc2980cfb2c8153f80cb0e3992eb89a83";
const TREASURY = "0x289CF343dE1CeC91E144a6E34E0BBcbceBfFA879";

function bodyOf(call: number): Record<string, unknown> {
  const init = apiFetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
}
function urlOf(call: number): string {
  return String(apiFetchMock.mock.calls[call]?.[0]);
}

beforeEach(() => {
  apiFetchMock.mockClear();
  // A fresh Response per call: a body can only be read once.
  apiFetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ success: true, data: { id: "1", kashReceived: "1000" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
  );
});

describe("purchase", () => {
  it("carries the on-chain payment receipt so the engine can verify it", async () => {
    // Without the hash the engine has nothing to check `from == wallet`
    // against, and refuses the purchase outright.
    await postKashPurchase(WALLET, "10", "0xabc");
    expect(urlOf(0)).toContain("/api/kash/purchases");
    expect(bodyOf(0)).toMatchObject({ wallet: WALLET, usdcAmount: "10", paymentTxHash: "0xabc" });
  });

  it("sends the amount as a decimal string, never a number", async () => {
    // The engine rejects JSON numbers: floats cannot carry money.
    await postKashPurchase(WALLET, "10.5");
    expect(typeof bodyOf(0).usdcAmount).toBe("string");
  });
});

describe("send", () => {
  it("encodes an ERC-20 transfer to the recipient", () => {
    const data = usdcTransferData(TREASURY, "1.5");
    expect(data.startsWith("0xa9059cbb")).toBe(true);
    expect(data.toLowerCase()).toContain(TREASURY.slice(2).toLowerCase());
  });

  it("scales USDC by 6 decimals, not KSH's 18", () => {
    // Reusing the KSH helper here would overpay by a factor of 10^12.
    expect(usdcToAtomic("1.5")).toBe(1_500_000n);
  });

  it("refuses a malformed destination rather than burning the tokens", () => {
    expect(() => usdcTransferData("not-an-address", "1")).toThrow(/EVM address/);
  });
});

describe("convert", () => {
  it("sends a retry key so a timeout cannot burn twice", async () => {
    // The real path is three sequential Base transactions against a 10s
    // gateway timeout, so the client WILL retry conversions that already
    // burned and already paid.
    const key = newConversionKey();
    await postKashConversion(WALLET, "500", undefined, key);
    await postKashConversion(WALLET, "500", undefined, key);
    expect(bodyOf(0).idempotencyKey).toBe(bodyOf(1).idempotencyKey);
  });

  it("passes the permit through untouched", async () => {
    const permit = { deadline: 1, v: 27, r: "0xr", s: "0xs" };
    await postKashConversion(WALLET, "500", permit, "k");
    expect(bodyOf(0).permit).toEqual(permit);
  });
});

describe("claim", () => {
  it("settles only the caller's own wallet, carrying its signature and timestamp", async () => {
    await postKashClaim(WALLET, "0xsig", 1_700_000_000_000);
    expect(urlOf(0)).toContain("/api/kash/settlements/claim");
    expect(bodyOf(0)).toEqual({ wallet: WALLET, signature: "0xsig", timestamp: 1_700_000_000_000 });
  });
});

describe("tier upgrade", () => {
  it("charges the exact tier price, pinned to USDC precision", () => {
    // String(number) can carry float artefacts with more precision than USDC
    // holds, which would make a valid tier unpurchasable.
    expect(usdcToAtomic(usdcAmountForPrice(1.5))).toBe(1_500_000n);
    expect(usdcToAtomic(usdcAmountForPrice(4.5))).toBe(4_500_000n);
  });

  it("carries the payment receipt to the engine", async () => {
    await postKashSubscribe(WALLET, 3, "0xpaid");
    expect(bodyOf(0)).toMatchObject({ wallet: WALLET, tier: 3, paymentTxHash: "0xpaid" });
  });
});
