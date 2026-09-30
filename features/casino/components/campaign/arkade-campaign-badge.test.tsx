import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { campaignJourney, qualifiedJourney } from "./campaign-fixture";
import { ArkadeCampaignBadge } from "./arkade-campaign-badge";

const mockUseCampaign = vi.hoisted(() => vi.fn());

vi.mock("@/features/casino/hooks/use-arkade-campaign", () => ({
  useArkadeCampaign: mockUseCampaign,
}));

// The badge reads the session itself: the journey is authenticated by the
// wallet, and the wallet is what keys the cache the banner shares.
const session = vi.hoisted(() => ({
  ready: true,
  authenticated: true,
  evmAddress: "0x0000000000000000000000000000000000000001" as string | null,
}));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ...session,
    solanaAddress: null,
    profile: { name: "Test", email: null, avatarSeed: "seed" },
    logout: vi.fn(),
  }),
}));

vi.mock("@/components/ui/modal-shell", () => ({
  ModalShell: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
}));

const journey = campaignJourney;

describe("ArkadeCampaignBadge", () => {
  beforeEach(() => {
    mockUseCampaign.mockReset();
    mockUseCampaign.mockReturnValue({ data: journey });
    session.ready = true;
    session.authenticated = true;
    session.evmAddress = "0x0000000000000000000000000000000000000001";
  });

  it("does not fire the private campaign query until the wallet is known", () => {
    session.evmAddress = null;
    const { container } = render(<ArkadeCampaignBadge enabled />);

    expect(container).toBeEmptyDOMElement();
    expect(mockUseCampaign).toHaveBeenCalledWith(false, null);
  });

  it("keys the query by the wallet the request is authenticated as", () => {
    render(<ArkadeCampaignBadge enabled />);
    expect(mockUseCampaign).toHaveBeenCalledWith(true, session.evmAddress);
  });

  it("shows exact progress and campaign rules in the shared game modal", () => {
    render(<ArkadeCampaignBadge enabled />);
    fireEvent.click(screen.getByRole("button", { name: /open arkade campaign/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "7-Day Triple Challenge" })).toBeInTheDocument();
    expect(screen.getByText("Complete all 3 missions")).toBeInTheDocument();
    expect(screen.getAllByText("Cash out at 11.50x or higher")).toHaveLength(2);
    expect(screen.getAllByText("Minimum stake: 1.00 USDC")).toHaveLength(2);
    expect(screen.getByText("Win 4 qualifying bets in a row")).toBeInTheDocument();
    expect(screen.getByText("2/4 · Best 3")).toBeInTheDocument();
    expect(screen.getByText("2 missions left to unlock your entry")).toBeInTheDocument();
  });

  it("switches the badge and entry panel to the secured state", () => {
    mockUseCampaign.mockReturnValue({ data: qualifiedJourney });

    render(<ArkadeCampaignBadge enabled />);
    expect(screen.getByRole("button", { name: /entry secured/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /entry secured/i }));
    expect(screen.getByText("Your draw entry is secured")).toBeInTheDocument();
    expect(screen.getByLabelText("3 of 3 missions complete")).toBeInTheDocument();
  });
});
