import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const session = vi.hoisted(() => ({
  evmAddress: null as string | null,
  solanaAddress: null as string | null,
}));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: session.evmAddress,
    solanaAddress: session.solanaAddress,
    userId: "u",
    profile: { name: "u", email: "", avatarSeed: "u" },
    logout: async () => {},
  }),
}));

const copied = vi.fn();
vi.mock("@/lib/clipboard", () => ({
  copyText: (value: string) => (copied(value), Promise.resolve(true)),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/network-icon", () => ({ NetworkIcon: () => null }));

import { WalletAddresses } from "./wallet-addresses";

const EVM = "0x1234567890abcdef1234567890abcdef12345678";
const SOL = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

describe("WalletAddresses", () => {
  it("shows both chains the account holds", () => {
    session.evmAddress = EVM;
    session.solanaAddress = SOL;
    render(<WalletAddresses />);
    expect(screen.getByText("Base")).toBeInTheDocument();
    expect(screen.getByText("Solana")).toBeInTheDocument();
  });

  // Truncation is for the eye. The real value must stay reachable to a screen
  // reader, a long-press and a copy — all three read the full string.
  it("keeps the FULL address available even though it renders truncated", () => {
    session.evmAddress = EVM;
    session.solanaAddress = null;
    render(<WalletAddresses />);
    expect(screen.getByText("0x1234…5678")).toBeInTheDocument();
    expect(screen.getByLabelText(`Base: ${EVM}`)).toHaveAttribute("title", EVM);
  });

  it("copies the whole address, not what is on screen", async () => {
    copied.mockClear();
    session.evmAddress = null;
    session.solanaAddress = SOL;
    render(<WalletAddresses />);
    fireEvent.click(screen.getByRole("button"));
    await Promise.resolve();
    expect(copied).toHaveBeenCalledWith(SOL);
  });

  it("draws nothing at all when the account has no wallet yet", () => {
    session.evmAddress = null;
    session.solanaAddress = null;
    const { container } = render(<WalletAddresses />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists only the chains that exist, never an empty row", () => {
    session.evmAddress = EVM;
    session.solanaAddress = null;
    render(<WalletAddresses />);
    expect(screen.queryByText("Solana")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
