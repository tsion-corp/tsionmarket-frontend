import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { bech32m } from "@scure/base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MINE = "wsk1q9dunpfcdfj89hq2w9ra3q4qqgrpwmxmvu00z67f";
// The same account as mna1q8lye5…, spelled under the wsk prefix.
const THEIRS = bech32m.encodeFromBytes(
  "wsk",
  bech32m.decodeToBytes("mna1q8lye5pxhet776htmfrgf2ffrvztuf0j65dyuyjz").bytes
);
const account = { address: MINE, hasWallet: true, unlocked: true };
const sendKash = vi.fn(async (_i: unknown) => ({ hash: "ab".repeat(32) }));

vi.mock("@/hooks/use-intertrain-account", () => ({ useIntertrainAccount: () => account }));
vi.mock("@/hooks/use-wsk-balance", () => ({
  wskBalanceKey: (a: string | null) => ["wsk-balance", a],
  useWskBalance: () => ({ data: 5_000_000n }),
}));
vi.mock("@/lib/intertrain/transfer", () => ({
  sendKash: (i: unknown) => sendKash(i),
  transferConfirmed: async () => true,
  transferFee: async () => 1n,
}));
vi.mock("@/lib/signer/session", () => ({
  getCustomWalletSession: () => ({ uid: "u", pkg: { walletId: "w" } }),
}));
vi.mock("@/lib/wallet-core/unlock-state", () => ({ getUnlockedKey: () => new Uint8Array(32) }));
vi.mock("@/lib/wallet-core/intertrain", async (orig) => ({
  ...(await orig<typeof import("@/lib/wallet-core/intertrain")>()),
  withIntertrainKey: async (_p: unknown, _d: unknown, run: (k: unknown) => unknown) =>
    run({ address: MINE, publicKey: new Uint8Array(32), seed: new Uint8Array(32) }),
}));
vi.mock("@/lib/signer/unlock-request", () => ({ requestWalletUnlock: vi.fn() }));

import { KashSendIntertrainModal } from "./kash-send-intertrain-modal";

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <KashSendIntertrainModal open onClose={vi.fn()} />
    </QueryClientProvider>
  );
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  account.unlocked = true;
  sendKash.mockClear();
});
afterEach(cleanup);

describe("KashSendIntertrainModal", () => {
  it("won't send to your own address or a malformed one, and says why", () => {
    show();
    type("Recipient address", MINE);
    expect(screen.getByText(/your own address/i)).toBeInTheDocument();
    type("Recipient address", "nope");
    expect(screen.getByText(/not a valid intertrain address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send kash$/i })).toBeDisabled();
  });

  it("won't send more than the balance less the fee", () => {
    show();
    type("Recipient address", THEIRS);
    type("Amount in Kash", "5");
    expect(screen.getByText(/network fee is/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^send kash$/i })).toBeDisabled();
  });

  it("signs with the wallet's own account and shows the explorer link", async () => {
    show();
    type("Recipient address", THEIRS);
    type("Amount in Kash", "1.5");
    fireEvent.click(screen.getByRole("button", { name: /^send kash$/i }));
    await waitFor(() => expect(sendKash).toHaveBeenCalledTimes(1));
    expect(sendKash.mock.calls[0]![0]).toMatchObject({ to: THEIRS, amount: 1_500_000n });
    const link = await screen.findByRole("link", { name: /intertrain explorer/i });
    expect(link).toHaveAttribute(
      "href",
      `https://explorer.intertrain.online/tx/${"ab".repeat(32)}`
    );
  });

  it("asks to unlock instead of offering to send while the wallet is locked", () => {
    account.unlocked = false;
    show();
    expect(screen.getByRole("button", { name: /unlock your wallet to send/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^send kash$/i })).not.toBeInTheDocument();
  });
});
