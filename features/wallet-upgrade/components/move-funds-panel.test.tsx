import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TokenBalance } from "@/lib/server/alchemy";
import { planMove } from "../lib/move-funds";

const OLD_EVM = "0x1111111111111111111111111111111111111111";
const OLD_SOL = "EBEgbXmCh2mztfyMh5jWcBQUyUBjJ8jBmAgbuT6uMVnX";
const NEW_EVM = "0x412feF17cb2a2A64103c72Ba62aAa08c7fab57f8";
const NEW_SOL = "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk";

const mutate = vi.fn();
let scanData: { plan: ReturnType<typeof planMove>; missing: string[] } | undefined;

vi.mock("../hooks/use-decane-account", () => ({
  useDecaneAccount: () => ({ authenticated: true, evmAddress: OLD_EVM, solanaAddress: OLD_SOL }),
}));
vi.mock("../hooks/use-move-funds", () => ({
  useMoveScan: () => ({
    data: scanData,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useRunMove: () => ({ mutate, isPending: false, error: null, data: undefined }),
}));

import { MoveFundsPanel } from "./move-funds-panel";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const tok = (over: Partial<TokenBalance>): TokenBalance =>
  ({
    symbol: "USDC",
    name: "USD Coin",
    network: "eth-mainnet",
    address: "0x00000000000000000000000000000000000000aa",
    decimals: 6,
    kind: "token",
    balance: 25,
    rawBalance: "25000000",
    priceUsd: 1,
    valueUsd: 25,
    logo: null,
    ...over,
  }) as TokenBalance;

const config = (dryRun: boolean) =>
  ({ target: "development", dryRun, moveFundsAvailable: true }) as never;

const linked = { evm: OLD_EVM, solana: OLD_SOL };
const destinations = { evm: NEW_EVM, solana: NEW_SOL };

function mount(dryRun = true) {
  scanData = {
    missing: [],
    plan: planMove([
      tok({}),
      tok({
        network: "arb-mainnet",
        symbol: "USDT",
        valueUsd: 10,
        balance: 10,
        rawBalance: "10000000",
      }),
      tok({
        network: "opt-mainnet",
        symbol: "OP",
        valueUsd: 99,
        balance: 99,
        rawBalance: "99000000",
      }),
      tok({
        network: "polygon-mainnet",
        symbol: "POL",
        address: null,
        decimals: 18,
        valueUsd: 40,
        balance: 40,
        rawBalance: "40000000000000000000",
      }),
    ]),
  };
  render(<MoveFundsPanel config={config(dryRun)} linked={linked} destinations={destinations} />);
}

describe("MoveFundsPanel", () => {
  it("lists Ethereum, Arbitrum and Base to move, and greys out every other chain", () => {
    mount();
    const moving = screen.getByLabelText("Will move");
    expect(within(moving).getByText("Ethereum")).toBeInTheDocument();
    expect(within(moving).getByText("Arbitrum")).toBeInTheDocument();
    expect(within(moving).queryByText("Optimism")).not.toBeInTheDocument();

    const locked = screen.getByLabelText("Not available yet");
    for (const chain of ["Optimism", "Polygon"])
      expect(within(locked).getByText(chain)).toBeInTheDocument();
    for (const row of Array.from(locked.querySelectorAll(":scope > li"))) {
      expect(row).toHaveAttribute("data-disabled", "true");
      expect(row.className).toMatch(/pointer-events-none/);
      expect(row.className).toMatch(/opacity-40/);
      expect(within(row as HTMLElement).queryByRole("checkbox")).toBeNull();
      expect(within(row as HTMLElement).queryByRole("button")).toBeNull();
    }
  });

  it("totals only what can move, not the greyed-out chains", () => {
    mount();
    expect(screen.getByText("$35.00")).toBeInTheDocument(); // 25 ETH-chain + 10 Arbitrum
    expect(screen.queryByText("$174.00")).not.toBeInTheDocument();
  });

  it("says it is a rehearsal and will not send, in development", () => {
    mount(true);
    expect(screen.getByText(/Rehearsal\. Nothing will be sent/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rehearse the move/i })).toBeInTheDocument();
  });

  it("needs the addresses confirmed before the button works, then sends only the movable plan", () => {
    mount(false);
    const button = screen.getByRole("button", { name: /move \$35\.00 to my new wallet/i });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mutate).toHaveBeenCalledTimes(1);
    const sent = mutate.mock.calls[0]![0] as { plan: { chains: Array<{ network: string }> } };
    expect(sent.plan.chains.map((c) => c.network).sort()).toEqual(["arb-mainnet", "eth-mainnet"]);
  });

  it("shows where it is going, and refuses an address that is the old one", () => {
    mount();
    expect(screen.getByText(/Ethereum, Arbitrum, Base: 0x412f…57f8/)).toBeInTheDocument();
    cleanup();
    render(
      <MoveFundsPanel
        config={config(true)}
        linked={linked}
        destinations={{ evm: OLD_EVM, solana: NEW_SOL }}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/same as your old/i);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("will not touch a different signed-in account than the one connected", () => {
    scanData = undefined;
    render(
      <MoveFundsPanel
        config={config(true)}
        linked={{ evm: NEW_EVM, solana: null }}
        destinations={destinations}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/different current account/i);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
