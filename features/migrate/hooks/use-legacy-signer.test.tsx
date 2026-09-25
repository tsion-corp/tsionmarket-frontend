// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const RECORDED = "0xC14733501F25680e6f53c48f7afBe4F946642aD1";
const FIRST = "0xE7bBe330023C5Dd67bCF1bF0D062B3b1B1921dEB";

const state = vi.hoisted(() => ({
  wallets: [] as Array<{ walletClientType: string; address: string }>,
  embedded: [] as Array<{ chainType: string; address: string }>,
  recordedEvm: null as string | null,
  recordedSol: null as string | null,
  // The old account's email vs the Decane session's — see use-legacy-email-match.
  mismatch: false,
}));

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { id: "did:privy:u" } }),
  useWallets: () => ({ wallets: state.wallets }),
}));
vi.mock("@/features/migrate/hooks/use-migration-status", () => ({
  useMigrationStatus: () => ({
    data: { legacy: { evm: state.recordedEvm, solana: state.recordedSol } },
  }),
}));
vi.mock("@/lib/user", () => ({
  // The account's own embedded wallets, and "first ethereum" as the fallback.
  getEmbeddedWallets: () => state.embedded,
  getWalletAddress: (_user: unknown, chain: string) =>
    chain === "ethereum"
      ? (state.embedded.find((w) => w.chainType === "ethereum")?.address ?? null)
      : null,
}));
vi.mock("@/features/migrate/hooks/use-legacy-send", () => ({
  useLegacyEvmSendBatch: () => vi.fn(),
  useLegacySendToken: () => vi.fn(),
}));
vi.mock("@/features/migrate/hooks/use-fresh-legacy-session", () => ({
  useFreshLegacySession: () => true,
}));
vi.mock("@/features/migrate/hooks/use-legacy-email-match", () => ({
  useLegacyEmailMatch: () => ({
    expected: "korode@gmail.com",
    actual: state.mismatch ? "demitchy@gmail.com" : "korode@gmail.com",
    mismatch: state.mismatch,
  }),
}));

import { useLegacySigner } from "@/features/migrate/hooks/use-legacy-signer";

beforeEach(() => {
  state.mismatch = false;
  state.wallets = [];
  state.embedded = [{ chainType: "ethereum", address: FIRST }];
  state.recordedEvm = null;
  state.recordedSol = null;
});

describe("useLegacySigner", () => {
  // Seen live: sign-in lands, the address is on the user record, the panel
  // auto-sweeps, and every send fails "No EVM wallet is connected" because the
  // embedded wallet object had not arrived yet.
  it("hands out no signer until the embedded EVM wallet object is actually present", () => {
    const { result, rerender } = renderHook(() => useLegacySigner());
    expect(result.current).toBeNull();

    state.wallets = [{ walletClientType: "privy", address: FIRST }];
    rerender();
    expect(result.current).not.toBeNull();
    expect(result.current?.addresses.evm).toBe(FIRST);
  });

  it("an external wallet in the list does not count", () => {
    state.wallets = [{ walletClientType: "metamask", address: FIRST }];
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current).toBeNull();
  });

  // Two embedded wallets, and the funded one is not first. The signer must
  // target the RECORDED wallet, so discovery reads where the money actually is.
  it("prefers the backend-recorded wallet over the first when the account has both", () => {
    state.embedded = [
      { chainType: "ethereum", address: FIRST },
      { chainType: "ethereum", address: RECORDED },
    ];
    state.recordedEvm = RECORDED;
    state.wallets = [
      { walletClientType: "privy", address: FIRST },
      { walletClientType: "privy", address: RECORDED },
    ];
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current?.addresses.evm).toBe(RECORDED);
  });

  // The recorded wallet belongs to a different account than the one signed in.
  // It is not among these wallets, so fall back to the first — never claim an
  // address this session cannot sign for.
  it("falls back to the first wallet when the recorded one is not this account's", () => {
    state.recordedEvm = RECORDED;
    state.wallets = [{ walletClientType: "privy", address: FIRST }];
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current?.addresses.evm).toBe(FIRST);
  });

  // Recorded wallet known, but its object has not arrived yet: no signer, so no
  // send fires against a wallet that cannot yet sign.
  it("prefers the recorded Solana wallet too, when the account holds it", () => {
    const SOL_FIRST = "So1First1111111111111111111111111111111111";
    const SOL_RECORDED = "So1Recorded22222222222222222222222222222222";
    state.embedded = [
      { chainType: "solana", address: SOL_FIRST },
      { chainType: "solana", address: SOL_RECORDED },
    ];
    state.recordedSol = SOL_RECORDED;
    // No EVM this account; a signer still forms on the Solana side alone.
    state.wallets = [];
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current?.addresses.solana).toBe(SOL_RECORDED);
  });

  it("waits for the recorded wallet's object even when its address is known", () => {
    state.embedded = [
      { chainType: "ethereum", address: FIRST },
      { chainType: "ethereum", address: RECORDED },
    ];
    state.recordedEvm = RECORDED;
    state.wallets = [{ walletClientType: "privy", address: FIRST }];
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current).toBeNull();
  });
});

// The old account must be this person's. Signed in to the old side as someone
// else, no signer is handed out at all — so nothing links and nothing moves,
// on every path that spends from it.
describe("useLegacySigner — the old account must match the Decane one", () => {
  it("hands out no signer when the old account's email differs, even with the wallet present", () => {
    state.wallets = [{ walletClientType: "privy", address: FIRST }];
    state.mismatch = true;
    const { result } = renderHook(() => useLegacySigner());
    expect(result.current).toBeNull();
  });
});
