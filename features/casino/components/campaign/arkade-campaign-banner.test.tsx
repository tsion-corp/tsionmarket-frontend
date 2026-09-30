import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { campaignJourney, qualifiedJourney } from "./campaign-fixture";
import { ArkadeCampaignBanner } from "./arkade-campaign-banner";

const mockUseCampaign = vi.hoisted(() => vi.fn());
vi.mock("@/features/casino/hooks/use-arkade-campaign", () => ({
  useArkadeCampaign: mockUseCampaign,
}));

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

function renderBanner() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ArkadeCampaignBanner />
    </NextIntlClientProvider>
  );
}

// The banner is the campaign's front door on the portfolio and Arkade pages.
// It reads the same journey the in-game badge reads, from the same cache,
// and opens the same modal.
describe("ArkadeCampaignBanner", () => {
  beforeEach(() => {
    mockUseCampaign.mockReset();
    mockUseCampaign.mockReturnValue({ data: campaignJourney });
    session.ready = true;
    session.authenticated = true;
    session.evmAddress = "0x0000000000000000000000000000000000000001";
  });

  it("asks for the journey by wallet, only once the session is known", () => {
    renderBanner();
    expect(mockUseCampaign).toHaveBeenCalledWith(true, session.evmAddress);
  });

  it("renders nothing without a session", () => {
    session.authenticated = false;
    session.evmAddress = null;
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
    expect(mockUseCampaign).toHaveBeenCalledWith(false, null);
  });

  it("renders nothing without a campaign, or for a cancelled one", () => {
    mockUseCampaign.mockReturnValue({ data: undefined });
    expect(renderBanner().container).toBeEmptyDOMElement();

    mockUseCampaign.mockReturnValue({
      data: { ...campaignJourney, campaign: { ...campaignJourney.campaign, status: "cancelled" } },
    });
    expect(renderBanner().container).toBeEmptyDOMElement();
  });

  it("names the prize, the campaign, the rule, and the progress", () => {
    renderBanner();
    expect(screen.getByText("7-Day Triple Challenge")).toBeInTheDocument();
    expect(screen.getByText("$50")).toBeInTheDocument();
    expect(screen.getByText(/11\.50x on Arkjet and Chicken/)).toBeInTheDocument();
    expect(screen.getByText(/4 in a row on Spin/)).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText(/Ends in/)).toBeInTheDocument();
  });

  it("is one button that opens the campaign modal", () => {
    renderBanner();
    fireEvent.click(screen.getByRole("button", { name: /7-Day Triple Challenge/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "7-Day Triple Challenge" })).toBeInTheDocument();
    expect(screen.getByText("Complete all 3 missions")).toBeInTheDocument();
  });

  it("turns gold and says so once the entry is secured", () => {
    mockUseCampaign.mockReturnValue({ data: qualifiedJourney });
    renderBanner();
    const button = screen.getByRole("button");
    expect(button.className).toMatch(/qualified/i);
    expect(screen.getByText("Entry secured")).toBeInTheDocument();
    expect(screen.getByText("View entry")).toBeInTheDocument();
    expect(screen.queryByText("See missions")).toBeNull();
    expect(screen.queryByText("3/3")).toBeNull();
  });

  it("marks each completed mission on the track", () => {
    renderBanner();
    const track = screen.getByLabelText("1 of 3 missions complete");
    expect(track.querySelectorAll("[data-complete='true']")).toHaveLength(1);
  });
});
