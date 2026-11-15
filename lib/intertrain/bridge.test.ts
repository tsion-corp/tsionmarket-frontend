import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARBITRUM_WSK_BRIDGE,
  WSK_DEPOSIT_TOPIC,
  approveCall,
  depositCall,
  findDeposit,
  formatUsdc,
  operationIdFor,
  parseUsdc,
} from "./bridge";
import { getBridgeOperationStatus, getWskBalance } from "./rpc";

// A real deposit on the live bridge (Arbitrum One tx 0x45db76b1…e936e, 1 USDC), exactly as the node returned it.
const REAL_LOG = {
  address: "0x0729f81acc0948089b0bacc0685c461f8f54f23b",
  topics: [
    WSK_DEPOSIT_TOPIC,
    "0x857f614c8a250143c06db4e73f4fad34721a59740e52e22a7fc69762d335a5dc",
    "0x000000000000000000000000fba9b1c09ab9a76bf35c3df9dcd30adb635dddff",
  ],
  data:
    "0x00000000000000000000000000000000000000000000000000000000000f4240" +
    "0000000000000000000000000000000000000000000000000000000000000040" +
    "000000000000000000000000000000000000000000000000000000000000002c" +
    "77736b31713964756e70666364666a3839687132773972613371347171677270776d786d767530307a3637660000000000000000000000000000000000000000",
};
const DESTINATION = "wsk1q9dunpfcdfj89hq2w9ra3q4qqgrpwmxmvu00z67f";

describe("Arbitrum USDC -> WSK calls", () => {
  it("uses the selectors the live bridge and USDC expect", () => {
    expect(approveCall(1n).data.slice(0, 10)).toBe("0x095ea7b3");
    expect(depositCall(1n, DESTINATION).data.slice(0, 10)).toBe("0xbf1bf299");
  });

  it("encodes the deposit exactly as the Intertrain web wallet does", () => {
    // The wallet's own hand-rolled encoder (intertrain-wallet/lib/arbitrum.js), kept here as the reference.
    const pad32 = (hex: string) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
    const num = (n: bigint) => pad32(n.toString(16));
    const bytes = new TextEncoder().encode(DESTINATION);
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
    const reference =
      "0xbf1bf299" + num(2_500_000n) + num(64n) + num(BigInt(bytes.length)) + padded;
    expect(depositCall(2_500_000n, DESTINATION).data).toBe(reference);
  });

  it("approves the bridge for exactly the amount", () => {
    const { data } = approveCall(1_000_000n);
    expect(data.toLowerCase()).toContain(ARBITRUM_WSK_BRIDGE.slice(2).toLowerCase());
    expect(data.endsWith(1_000_000n.toString(16).padStart(64, "0"))).toBe(true);
  });

  it("derives the id the live node reports as confirmed for the real deposit", () => {
    expect(operationIdFor(REAL_LOG.topics[1]!)).toBe(
      "f6aa386e921f1c22c93908954b2a053338558b0d76b4316a1cfd643f93938aad"
    );
  });
});

describe("reading a deposit", () => {
  it("decodes the real deposit event", () => {
    expect(findDeposit([REAL_LOG])).toEqual({
      depositId: "857f614c8a250143c06db4e73f4fad34721a59740e52e22a7fc69762d335a5dc",
      sender: "0xFbA9b1c09AB9a76BF35C3df9DCd30adb635DdDfF",
      amount: 1_000_000n,
      destination: DESTINATION,
    });
  });

  it("ignores an identical event from another contract, and other events", () => {
    expect(
      findDeposit([{ ...REAL_LOG, address: "0x0000000000000000000000000000000000000001" }])
    ).toBeNull();
    expect(findDeposit([{ ...REAL_LOG, topics: REAL_LOG.topics.slice(0, 2) }])).toBeNull();
    expect(
      findDeposit([{ ...REAL_LOG, topics: ["0x" + "11".repeat(32), ...REAL_LOG.topics.slice(1)] }])
    ).toBeNull();
  });
});

describe("amounts", () => {
  it("parses plain amounts and refuses the rest", () => {
    expect(parseUsdc("12.5")).toBe(12_500_000n);
    expect(parseUsdc("0.000001")).toBe(1n);
    expect(formatUsdc(12_500_000n)).toBe("12.5");
    expect(formatUsdc(0n)).toBe("0");
    for (const bad of ["", "0", "-1", "1e6", "1.0000001", "abc", "1,5", " "]) {
      expect(() => parseUsdc(bad)).toThrow();
    }
  });
});

describe("Intertrain node reads", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (result: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 })
      )
    );

  it("reads a native WSK balance in base units", async () => {
    answer({ address: DESTINATION, asset: "WSK", balance: "1086506", nonce: 8 });
    expect(await getWskBalance(DESTINATION)).toBe(1_086_506n);
  });

  it("reads an account with no balance field as zero", async () => {
    answer({ address: DESTINATION });
    expect(await getWskBalance(DESTINATION)).toBe(0n);
  });

  it("reports a bridge operation's status", async () => {
    answer({ operation_id: "x", status: "confirmed" });
    expect(await getBridgeOperationStatus("x")).toBe("confirmed");
  });

  it("says so when the node fails, rather than reporting zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 502 }))
    );
    await expect(getWskBalance(DESTINATION)).rejects.toThrow(/502/);
  });
});
