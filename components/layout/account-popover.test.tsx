import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountPopover } from "./account-popover";
import {
  resetMigrationRequest,
  useMigrationRequest,
} from "@/features/migrate/lib/migration-card-store";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockLogout = vi.fn();
const mockLinkWithPasskey = vi.fn();

// The popover reads the session through the Decane-backed seam and the kit's
// own hooks (passkey linking), replacing Privy's usePrivy/useLogout/useLinkWithPasskey.
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: "0x0000000000000000000000000000000000000001",
    solanaAddress: null,
    profile: { name: "Test User", email: "test@example.com", avatarSeed: "did:privy:test" },
    logout: mockLogout,
  }),
}));

vi.mock("decane-connect-kit", () => ({
  useSocialAuth: () => ({ canUsePasskey: false }),
  useSocialWallet: () => ({ addPasskey: mockLinkWithPasskey }),
}));

// The migration door needs a query client and the whole venue-adapter graph;
// neither is what this test is about.
// Deep-imported now, not through the @/features/migrate barrel: that barrel
// re-exports UpdateBalanceButton, which mounts the whole Privy SDK, and this
// popover renders on every signed-in route.
vi.mock("@/features/migrate/components/move-old-money-entry", () => ({
  MoveOldMoneyButton: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick}>open-migration</button>
  ),
}));
vi.mock("@/components/layout/modals/wallet-addresses", () => ({
  WalletAddresses: () => <div data-testid="wallet-addresses" />,
}));
vi.mock("@/components/layout/migration-adapters", () => ({
  MIGRATION_ADAPTERS: [],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/referrals", () => ({
  InviteFriendsModal: () => null,
}));

// The account face reads the player's square profile. These cover the rail
// and its chrome, not where the picture comes from, so the read is stubbed
// out: null is the ordinary answer and leaves the seeded artwork in place.
vi.mock("@/hooks/use-square-avatar", () => ({
  useSquareAvatar: () => null,
  useSquareSeed: () => "seed",
}));

describe("AccountPopover", () => {
  it("renders nothing when closed", () => {
    const triggerRef = { current: document.createElement("button") };
    render(<AccountPopover open={false} onClose={() => {}} triggerRef={triggerRef} />);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders popover menu with user info and actions when open", () => {
    const triggerRef = { current: document.createElement("button") };
    render(<AccountPopover open={true} onClose={() => {}} triggerRef={triggerRef} />);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /signOut/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /inviteFriends/i })).toBeInTheDocument();
  });

  it("calls logout when sign out is clicked", () => {
    const onClose = vi.fn();
    const triggerRef = { current: document.createElement("button") };
    render(<AccountPopover open={true} onClose={onClose} triggerRef={triggerRef} />);

    fireEvent.click(screen.getByRole("menuitem", { name: /signOut/i }));
    expect(mockLogout).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when Escape key is pressed", () => {
    const onClose = vi.fn();
    const triggerRef = { current: document.createElement("button") };
    render(<AccountPopover open={true} onClose={onClose} triggerRef={triggerRef} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("stays mounted across an open/close cycle so it can play its exit animation", async () => {
    // The component must never early-return null on `open`: AnimatePresence
    // needs to see the closing render to play an exit frame, and an early
    // unmount skips straight past it. This asserts the component itself
    // reaches its own return regardless of `open`, and that the menu is
    // eventually removed once the exit completes.
    const triggerRef = { current: document.createElement("button") };
    const { rerender } = render(
      <AccountPopover open={true} onClose={() => {}} triggerRef={triggerRef} />
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();

    rerender(<AccountPopover open={false} onClose={() => {}} triggerRef={triggerRef} />);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});

function Request() {
  const request = useMigrationRequest();
  return <div data-testid="request">{request ? request.entry : "none"}</div>;
}

afterEach(() => resetMigrationRequest());

describe("the migration row", () => {
  // The popover mounts no card of its own. The one card lives on the session
  // and portals to document.body, so the popover closing behind a tap in it —
  // every click there reads as "outside the popover" — takes nothing down.
  it("asks the one card to open, from the account menu", () => {
    const triggerRef = { current: null };
    render(
      <>
        <AccountPopover open={true} onClose={() => {}} triggerRef={triggerRef} />
        <Request />
      </>
    );
    fireEvent.click(screen.getByText("open-migration"));
    expect(screen.getByTestId("request")).toHaveTextContent("account_modal");
  });
});
