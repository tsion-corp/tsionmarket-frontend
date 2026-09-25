import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { memeToken } from "@/lib/meme/fixture";
import { consentKey, useRiskConsent } from "@/features/trade/hooks/use-risk-consent";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";

// The contract: a token with known liquidity under $50k carries a
// LOW_LIQUIDITY warning, and the user must confirm it before a quote is asked
// for. The acknowledgement lasts the session and belongs to one token,
// identified by chainId + address. Every test uses its own address because the
// set is the session's, shared by every surface that asks.

const LOW = { code: "LOW_LIQUIDITY", message: "Liquidity is below $50,000." };

describe("useRiskConsent", () => {
  it("needs no consent for a token without a LOW_LIQUIDITY warning, other warnings included", () => {
    const token = memeToken({
      symbol: "CLEAN",
      warnings: [{ code: "HONEYPOT_SUSPECTED", message: "Advisory only." }],
    });
    const { result } = renderHook(() => useRiskConsent(token, "5"));
    expect(result.current.needsConsent).toBe(false);
    expect(result.current.consented).toBe(true);
    expect(result.current.prompting).toBe(false);
  });

  it("holds back a LOW_LIQUIDITY token until accepted, and prompts only once an amount is entered", () => {
    const token = memeToken({ symbol: "THIN1", warnings: [LOW] });
    const { result, rerender } = renderHook(({ amount }) => useRiskConsent(token, amount), {
      initialProps: { amount: "" },
    });
    expect(result.current.needsConsent).toBe(true);
    expect(result.current.consented).toBe(false);
    expect(result.current.prompting).toBe(false);

    rerender({ amount: "5" });
    expect(result.current.prompting).toBe(true);

    act(() => result.current.accept());
    expect(result.current.consented).toBe(true);
    expect(result.current.prompting).toBe(false);
  });

  it("keeps the acknowledgement for the session, across every surface that asks", () => {
    const token = memeToken({ symbol: "THIN2", warnings: [LOW] });
    const first = renderHook(() => useRiskConsent(token, "5"));
    const second = renderHook(() => useRiskConsent(token, "5"));
    act(() => first.result.current.accept());
    expect(second.result.current.consented).toBe(true);
    // A surface mounted later reads the same set.
    const later = renderHook(() => useRiskConsent(token, "5"));
    expect(later.result.current.consented).toBe(true);
  });

  it("belongs to one token: another address or another chain still asks", () => {
    const token = memeToken({ symbol: "THIN3", warnings: [LOW] });
    const sibling = memeToken({ symbol: "THIN4", warnings: [LOW] });
    const otherChain = memeToken({
      symbol: "THIN3",
      chainId: SOLANA_CHAIN_ID,
      address: token.address,
      warnings: [LOW],
    });
    const { result } = renderHook(() => useRiskConsent(token, "5"));
    act(() => result.current.accept());
    expect(renderHook(() => useRiskConsent(sibling, "5")).result.current.consented).toBe(false);
    expect(renderHook(() => useRiskConsent(otherChain, "5")).result.current.consented).toBe(false);
  });

  it("keys a Solana mint exactly as written, and a Base address in any case", () => {
    expect(consentKey({ chainId: SOLANA_CHAIN_ID, address: "BonkMintAbc" })).toBe(
      "101:BonkMintAbc"
    );
    expect(consentKey({ chainId: SOLANA_CHAIN_ID, address: "bonkmintabc" })).not.toBe(
      consentKey({ chainId: SOLANA_CHAIN_ID, address: "BonkMintAbc" })
    );
    expect(consentKey({ chainId: 8453, address: "0xAbCdEf" })).toBe(
      consentKey({ chainId: 8453, address: "0xabcdef" })
    );

    const upper = memeToken({
      symbol: "SOLX",
      chainId: SOLANA_CHAIN_ID,
      address: "SoLxMint111",
      warnings: [LOW],
    });
    const lower = { ...upper, address: "solxmint111" };
    const { result } = renderHook(() => useRiskConsent(upper, "5"));
    act(() => result.current.accept());
    expect(renderHook(() => useRiskConsent(lower, "5")).result.current.consented).toBe(false);
  });

  it("asks nothing while there is no token", () => {
    const { result } = renderHook(() => useRiskConsent(null, "5"));
    expect(result.current.needsConsent).toBe(false);
    expect(result.current.prompting).toBe(false);
  });
});
