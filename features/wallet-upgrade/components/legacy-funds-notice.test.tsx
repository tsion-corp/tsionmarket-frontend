import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  authenticated: true,
  hasNew: true,
  scan: { plan: { chains: [{ stuff: 1 }] } } as unknown,
  pathname: "/portfolio",
  nothing: false,
};

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ authenticated: state.authenticated, userId: "u1", ready: true }),
}));
vi.mock("@/hooks/use-has-custom-wallet", () => ({ useHasCustomWallet: () => state.hasNew }));
vi.mock("@/lib/signer/preference", () => ({ walletSwitchEnabled: () => true }));
vi.mock("@/lib/wallet-upgrade/environment", () => ({
  readUpgradeEnv: () => ({}),
  walletUpgradeConfig: () => ({ enabled: true, moveFundsAvailable: true }),
}));
vi.mock("../hooks/use-decane-account", () => ({
  useDecaneAccount: () => ({ evmAddress: "0xabc", solanaAddress: "sol" }),
}));
vi.mock("../hooks/use-move-funds", () => ({
  useMoveScan: () => ({ data: state.scan }),
}));
vi.mock("../lib/move-funds", () => ({ nothingToMove: () => state.nothing }));

import { LegacyFundsNotice } from "./legacy-funds-notice";

beforeEach(() => {
  state.authenticated = true;
  state.hasNew = true;
  state.scan = { plan: {} };
  state.pathname = "/portfolio";
  state.nothing = false;
  window.localStorage.clear();
});
afterEach(cleanup);

describe("LegacyFundsNotice", () => {
  it("tells someone with a new wallet and funds left in the old one to move them", () => {
    render(<LegacyFundsNotice />);
    expect(screen.getByText(/move your funds to your new wallet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /move my funds/i })).toHaveAttribute(
      "href",
      "/legacy-wallet"
    );
  });

  it("says nothing once the old wallet is empty", () => {
    state.nothing = true;
    const { container } = render(<LegacyFundsNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it("points someone with no new wallet to make one", () => {
    state.hasNew = false;
    render(<LegacyFundsNotice />);
    expect(screen.getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/upgrade");
  });

  it("stays away when signed out, on the wallet's own pages, and for a day after being dismissed", () => {
    state.authenticated = false;
    expect(render(<LegacyFundsNotice />).container).toBeEmptyDOMElement();
    cleanup();
    state.authenticated = true;
    state.pathname = "/legacy-wallet";
    expect(render(<LegacyFundsNotice />).container).toBeEmptyDOMElement();
    cleanup();
    state.pathname = "/portfolio";
    window.localStorage.setItem("tsion.legacy-notice.v1.u1", String(Date.now()));
    expect(render(<LegacyFundsNotice />).container).toBeEmptyDOMElement();
  });
});
