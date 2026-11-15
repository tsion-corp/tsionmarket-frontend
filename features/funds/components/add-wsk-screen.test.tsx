import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x5Bd81AfA2b9E89A5f73e4051b418Ba3B0ab14f1D";
const DEST = "wsk1q9dunpfcdfj89hq2w9ra3q4qqgrpwmxmvu00z67f";
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const BRIDGE_LOG = {
  address: "0x0729f81acc0948089b0bacc0685c461f8f54f23b",
  topics: [
    "0x8399ea2998de3fe00f8878f42216a68a8956c3687b5d9d0412c4c1a6d3b05ccf",
    "0x857f614c8a250143c06db4e73f4fad34721a59740e52e22a7fc69762d335a5dc",
    "0x000000000000000000000000fba9b1c09ab9a76bf35c3df9dcd30adb635dddff",
  ],
  data:
    "0x00000000000000000000000000000000000000000000000000000000000f4240" +
    "0000000000000000000000000000000000000000000000000000000000000040" +
    "000000000000000000000000000000000000000000000000000000000000002c" +
    "77736b31713964756e70666364666a3839687132773972613371347171677270776d786d767530307a3637660000000000000000000000000000000000000000",
};

const state = {
  kind: "custom" as "custom" | undefined,
  address: DEST as string | null,
  usdc: "5000000",
  paused: false,
  allowance: 0n,
};
const sendBatch = vi.fn(
  async (_calls: unknown[], _chain: number, _owner?: string) => "0x" + "ab".repeat(32)
);
const status = vi.fn(async (_id: string) => "confirmed");
const unlock = vi.fn();

vi.mock("@/hooks/use-wallet-signer", () => ({
  useWalletSigner: () => ({ kind: state.kind, addresses: { evm: OWNER } }),
}));
vi.mock("@/hooks/use-intertrain-account", () => ({
  useIntertrainAccount: () => ({ address: state.address, hasWallet: true, unlocked: true }),
}));
vi.mock("@/hooks/use-evm-send", () => ({ useEvmSendBatch: () => sendBatch }));
vi.mock("@/hooks/use-wsk-balance", () => ({
  wskBalanceKey: (a: string | null) => ["wsk-balance", a],
  useWskBalance: () => ({ data: 2_000_000n, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({
    tokens: [{ network: "arb-mainnet", address: USDC, rawBalance: state.usdc }],
    refetchFresh: vi.fn(async () => undefined),
  }),
}));
vi.mock("@/lib/signer/unlock-request", () => ({ requestWalletUnlock: () => unlock() }));
vi.mock("@/lib/intertrain/rpc", () => ({ getBridgeOperationStatus: (id: string) => status(id) }));
vi.mock("@/lib/trade/receipt", () => ({
  awaitReceipt: async () => ({ status: "success", logs: [BRIDGE_LOG] }),
  publicClientForChain: () => ({
    readContract: async ({ functionName }: { functionName: string }) =>
      functionName === "paused"
        ? state.paused
        : functionName === "balanceOf"
          ? BigInt(state.usdc)
          : state.allowance,
    getTransactionReceipt: async () => ({ status: "success", logs: [BRIDGE_LOG] }),
  }),
}));

import { AddWskScreen } from "./add-wsk-screen";

function show(onAddUsdc = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddWskScreen onBack={vi.fn()} onAddUsdc={onAddUsdc} />
    </QueryClientProvider>
  );
  return { onAddUsdc };
}
const type = (value: string) =>
  fireEvent.change(screen.getByLabelText("Amount in USDC"), { target: { value } });

beforeEach(() => {
  state.kind = "custom";
  state.address = DEST;
  state.usdc = "5000000";
  state.paused = false;
  state.allowance = 0n;
  sendBatch.mockClear();
  status.mockClear();
  unlock.mockClear();
  window.localStorage.clear();
});
afterEach(cleanup);

describe("AddWskScreen", () => {
  it("sends people without the new wallet to set it up, instead of offering a form", () => {
    state.kind = undefined;
    show();
    expect(screen.getByRole("link", { name: /set it up/i })).toHaveAttribute("href", "/upgrade");
    expect(screen.queryByLabelText("Amount in USDC")).not.toBeInTheDocument();
  });

  it("asks to unlock when the Intertrain address is not known yet", () => {
    state.address = null;
    show();
    fireEvent.click(screen.getByRole("button", { name: /unlock wallet/i }));
    expect(unlock).toHaveBeenCalled();
  });

  it("offers Arbitrum USDC when the amount is more than the wallet holds", () => {
    const { onAddUsdc } = show();
    type("9");
    expect(screen.getByRole("button", { name: /^add kash$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /add usdc on arbitrum/i }));
    expect(onAddUsdc).toHaveBeenCalled();
  });

  it("approves and deposits in one go, then follows the deposit to the credit", async () => {
    show();
    type("1");
    expect(screen.getByText(/1 Kash/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^add kash$/i }));

    await waitFor(() => expect(sendBatch).toHaveBeenCalledTimes(1));
    const [calls, chain, owner] = sendBatch.mock.calls[0]!;
    expect(chain).toBe(42161);
    expect(owner).toBe(OWNER);
    // Approval first (no allowance yet), then the deposit, to the user's own Intertrain address.
    expect((calls as Array<{ data: string }>).map((c) => c.data.slice(0, 10))).toEqual([
      "0x095ea7b3",
      "0xbf1bf299",
    ]);
    expect(await screen.findByText(/Kash added/, undefined, { timeout: 8000 })).toBeInTheDocument();
    // The relayer's operation id for the deposit, not anything the screen made up.
    expect(status).toHaveBeenCalledWith(
      "f6aa386e921f1c22c93908954b2a053338558b0d76b4316a1cfd643f93938aad"
    );
    expect(window.localStorage.length).toBe(0);
  }, 20_000);

  it("skips the approval when the bridge already has the allowance", async () => {
    state.allowance = 10_000_000n;
    show();
    type("1");
    fireEvent.click(screen.getByRole("button", { name: /^add kash$/i }));
    await waitFor(() => expect(sendBatch).toHaveBeenCalled());
    expect(
      (sendBatch.mock.calls[0]![0] as Array<{ data: string }>).map((c) => c.data.slice(0, 10))
    ).toEqual(["0xbf1bf299"]);
  });

  it("stops before sending when the bridge is paused", async () => {
    state.paused = true;
    show();
    type("1");
    fireEvent.click(screen.getByRole("button", { name: /^add kash$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/paused/i);
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("never puts the form back once a deposit has been sent", async () => {
    status.mockRejectedValue(new Error("network down"));
    sendBatch.mockResolvedValueOnce("0x" + "cd".repeat(32));
    show();
    type("1");
    fireEvent.click(screen.getByRole("button", { name: /^add kash$/i }));
    await waitFor(() => expect(sendBatch).toHaveBeenCalled());
    // A node that is briefly unreachable is not a failed deposit: still waiting, no second button to press.
    await screen.findByText(/waiting for intertrain|picking up/i);
    expect(screen.queryByRole("button", { name: /^add kash$/i })).not.toBeInTheDocument();
  });
});
