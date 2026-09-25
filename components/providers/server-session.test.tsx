import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const privy = vi.hoisted(() => ({
  state: { user: null as unknown, ready: false, authenticated: false },
}));

// The wallet hook reads the session through the Decane-backed seam. The cases
// below still describe the browser session as a Privy-shaped `user` with
// linked accounts, so translate that shape into the seam's addresses here.
function linkedWallet(chain: "ethereum" | "solana"): string | null {
  const user = privy.state.user as {
    linkedAccounts?: { type: string; chainType?: string; address?: string }[];
  } | null;
  const account = user?.linkedAccounts?.find((a) => a.type === "wallet" && a.chainType === chain);
  return account?.address ?? null;
}

vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: privy.state.ready,
    authenticated: privy.state.authenticated,
    evmAddress: privy.state.authenticated ? linkedWallet("ethereum") : null,
    solanaAddress: privy.state.authenticated ? linkedWallet("solana") : null,
    profile: { name: "", email: "", avatarSeed: "" },
    logout: vi.fn(),
  }),
}));

import { ServerSessionProvider, useSessionWallet } from "@/components/providers/server-session";
import type { ServerSession } from "@/lib/session";

const serverSession: ServerSession = {
  userId: "user_1",
  wallets: { ethereum: "0xServer", solana: "SoLServer" },
};

const privyUser = {
  id: "user_1",
  linkedAccounts: [
    { type: "wallet", walletClientType: "privy", chainType: "ethereum", address: "0xPrivy" },
  ],
};

function Wallet({ chain }: { chain: "ethereum" | "solana" }) {
  return <output data-testid={chain}>{useSessionWallet(chain) ?? "none"}</output>;
}

describe("useSessionWallet", () => {
  beforeEach(() => {
    privy.state = { user: null, ready: false, authenticated: false };
  });

  it("answers from the server before Privy is ready", () => {
    render(
      <ServerSessionProvider session={serverSession}>
        <Wallet chain="ethereum" />
        <Wallet chain="solana" />
      </ServerSessionProvider>
    );
    expect(screen.getByTestId("ethereum")).toHaveTextContent("0xserver");
    // Base58, so the case is the address. Only the EVM one is folded.
    expect(screen.getByTestId("solana")).toHaveTextContent("SoLServer");
  });

  it("is Privy's answer alone once Privy is ready, including no wallet", () => {
    privy.state = { user: privyUser, ready: true, authenticated: true };
    render(
      <ServerSessionProvider session={serverSession}>
        <Wallet chain="ethereum" />
        <Wallet chain="solana" />
      </ServerSessionProvider>
    );
    expect(screen.getByTestId("ethereum")).toHaveTextContent("0xprivy");
    // Privy lists no Solana wallet for this user. The server's snapshot must
    // not stand in: it could belong to whoever the cookie named when the page
    // rendered, and Privy has since become the authority.
    expect(screen.getByTestId("solana")).toHaveTextContent("none");
  });

  it("forgets the server's wallets once Privy reports signed out", () => {
    privy.state = { user: null, ready: true, authenticated: false };
    render(
      <ServerSessionProvider session={serverSession}>
        <Wallet chain="ethereum" />
        <Wallet chain="solana" />
      </ServerSessionProvider>
    );
    expect(screen.getByTestId("ethereum")).toHaveTextContent("none");
    expect(screen.getByTestId("solana")).toHaveTextContent("none");
  });

  it("is null with no session on either side", () => {
    render(
      <ServerSessionProvider session={null}>
        <Wallet chain="ethereum" />
      </ServerSessionProvider>
    );
    expect(screen.getByTestId("ethereum")).toHaveTextContent("none");
  });

  it("keeps a Solana address exactly as Privy gives it", () => {
    privy.state = {
      user: {
        id: "user_1",
        linkedAccounts: [
          {
            type: "wallet",
            walletClientType: "privy",
            chainType: "solana",
            address: "SoLPrivyWallet",
          },
        ],
      },
      ready: true,
      authenticated: true,
    };
    render(<Wallet chain="solana" />);
    expect(screen.getByTestId("solana")).toHaveTextContent("SoLPrivyWallet");
  });

  it("works outside the provider, from Privy alone", () => {
    privy.state = { user: privyUser, ready: true, authenticated: true };
    render(<Wallet chain="ethereum" />);
    expect(screen.getByTestId("ethereum")).toHaveTextContent("0xprivy");
  });
});
