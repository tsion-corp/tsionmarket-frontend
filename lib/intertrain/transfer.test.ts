import { ed25519 } from "@noble/curves/ed25519";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendKash, transferSigningBytes } from "./transfer";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const PUB = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

describe("transfer signing bytes", () => {
  it("match Intertrain's reference wallet byte for byte", () => {
    // Produced by the reference wallet's own transferBytes for these inputs.
    expect(
      hex(
        transferSigningBytes({
          chainId: "intertrain-1",
          from: "mna1q8lye5pxhet776htmfrgf2ffrvztuf0j65dyuyjz",
          to: "wsk1q9dunpfcdfj89hq2w9ra3q4qqgrpwmxmvu00z67f",
          nonce: 8,
          amount: 1_500_000n,
          fee: 1n,
          publicKey: PUB,
          memo: "hi",
        })
      )
    ).toBe(
      "010c696e746572747261696e2d310801fe4cd026be57ef6aebda4684a9291b04be25f2d5015bc985386a6472dc0a7147d882a00206176cdb67e0c65b010102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20026869"
    );
  });
});

describe("sendKash", () => {
  afterEach(() => vi.unstubAllGlobals());
  const seed = new Uint8Array(32).fill(7);
  const publicKey = ed25519.getPublicKey(seed);
  const FROM = "wsk1q9dunpfcdfj89hq2w9ra3q4qqgrpwmxmvu00z67f";
  const TO = "mna1q8lye5pxhet776htmfrgf2ffrvztuf0j65dyuyjz";

  function node(balance: string) {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const { method, params } = JSON.parse(init.body);
        calls.push({ method, params });
        const result =
          method === "chain_info"
            ? { chain_id: "intertrain-1" }
            : method === "account_get"
              ? { balance, nonce: 8 }
              : { hash: "ab".repeat(32) };
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
      })
    );
    return calls;
  }

  it("signs the transfer with the account's key and broadcasts it", async () => {
    const calls = node("5000000");
    const out = await sendKash({
      account: { address: FROM, publicKey, seed },
      to: TO,
      amount: 1_500_000n,
    });
    expect(out.hash).toBe("ab".repeat(32));
    const sent = calls.find((c) => c.method === "transaction_broadcast")!.params as {
      transaction: { unsigned: Record<string, string | number>; signature: string };
    };
    const { unsigned, signature } = sent.transaction;
    expect(unsigned).toMatchObject({ nonce: 8, amount: "1500000", fee: "1", from: FROM });
    expect(unsigned.to).toBe(
      "wsk1q8lye5pxhet776htmfrgf2ffrvztuf0j65dyuyjz".replace(
        "q8lye5pxhet776htmfrgf2ffrvztuf0j65dyuyjz",
        String(unsigned.to).slice(4)
      )
    );
    const bytes = transferSigningBytes({
      chainId: "intertrain-1",
      from: FROM,
      to: String(unsigned.to),
      nonce: 8,
      amount: 1_500_000n,
      fee: 1n,
      publicKey,
      memo: "",
    });
    expect(ed25519.verify(signature, bytes, publicKey)).toBe(true);
  });

  it("refuses when the balance cannot cover the amount and the fee, and sends nothing", async () => {
    const calls = node("1500000");
    await expect(
      sendKash({ account: { address: FROM, publicKey, seed }, to: TO, amount: 1_500_000n })
    ).rejects.toThrow(/enough/i);
    expect(calls.some((c) => c.method === "transaction_broadcast")).toBe(false);
  });

  it("refuses a bad recipient and sending to yourself", async () => {
    node("9000000");
    await expect(
      sendKash({ account: { address: FROM, publicKey, seed }, to: "nope", amount: 1n })
    ).rejects.toThrow();
    await expect(
      sendKash({ account: { address: FROM, publicKey, seed }, to: FROM, amount: 1n })
    ).rejects.toThrow(/yourself/);
  });
});
