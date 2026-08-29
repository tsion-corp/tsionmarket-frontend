import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { User } from "@privy-io/react-auth";
import { WalletAddresses } from "./wallet-addresses";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const copied = vi.fn();
vi.mock("@/lib/clipboard", () => ({
  copyText: (value: string) => (copied(value), Promise.resolve(true)),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/network-icon", () => ({ NetworkIcon: () => null }));

const EVM = "0x1234567890abcdef1234567890abcdef12345678";
const SOL = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

function userWith(wallets: Array<{ chainType: string; address: string }>): User {
  return {
    linkedAccounts: wallets.map((w) => ({
      type: "wallet",
      walletClientType: "privy",
      chainType: w.chainType,
      address: w.address,
    })),
  } as unknown as User;
}

describe("WalletAddresses", () => {
  // The gap this closes: on a phone the account sheet showed a name and an
  // email, so the answer to "where do I send funds" was to read six
  // characters out of the header and guess the rest.
  it("shows both chains the account holds", () => {
    render(
      <WalletAddresses
        user={userWith([
          { chainType: "ethereum", address: EVM },
          { chainType: "solana", address: SOL },
        ])}
      />
    );
    expect(screen.getByText("Base")).toBeInTheDocument();
    expect(screen.getByText("Solana")).toBeInTheDocument();
  });

  // Truncation is for the eye. The real value must stay reachable to a screen
  // reader, a long-press and a copy — all three read the full string.
  it("keeps the FULL address available even though it renders truncated", () => {
    render(<WalletAddresses user={userWith([{ chainType: "ethereum", address: EVM }])} />);
    expect(screen.getByText("0x1234…5678")).toBeInTheDocument();
    expect(screen.getByLabelText(`Base: ${EVM}`)).toHaveAttribute("title", EVM);
  });

  it("copies the whole address, not what is on screen", async () => {
    copied.mockClear();
    render(<WalletAddresses user={userWith([{ chainType: "solana", address: SOL }])} />);
    fireEvent.click(screen.getByRole("button"));
    await Promise.resolve();
    expect(copied).toHaveBeenCalledWith(SOL);
  });

  it("draws nothing at all when the account has no wallet yet", () => {
    const { container } = render(<WalletAddresses user={userWith([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists only the chains that exist, never an empty row", () => {
    render(<WalletAddresses user={userWith([{ chainType: "ethereum", address: EVM }])} />);
    expect(screen.queryByText("Solana")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
