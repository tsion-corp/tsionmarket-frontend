import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArkadeCampaignJourney } from "@/features/casino/lib/api/arkjet";
import { ArkadeCampaignBadge } from "./arkade-campaign-badge";

const mockUseCampaign = vi.hoisted(() => vi.fn());

vi.mock("@/features/casino/hooks/use-arkade-campaign", () => ({
  useArkadeCampaign: mockUseCampaign,
}));

vi.mock("@/components/ui/modal-shell", () => ({
  ModalShell: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
}));

const journey: ArkadeCampaignJourney = {
  campaign: {
    campaignId: "95e90041-6baf-4a6a-8716-b51950dad632",
    slug: "triple-challenge-test",
    displayName: "7-Day Triple Challenge",
    status: "active",
    startsAt: "2026-09-29T00:00:00Z",
    endsAt: "2026-10-06T00:00:00Z",
    secondsRemaining: 604_800,
    currency: "USDC",
    minimumStake: "1.00",
    minimumStakeMinor: 1_000_000,
    targetMultiplier: "11.50",
    targetMultiplierHundredths: 1_150,
    spinStreakTarget: 4,
    prize: "50.00",
    prizeMinor: 50_000_000,
    drawSeedCommitment: "7aa38e524814df49e37be56ff03fcf735c095a0a893add0fca290abb14f2598a",
    drawSeedRevealed: null,
    qualifiedEntrants: 12,
  },
  progress: {
    arkjet: { completed: true, bestMultiplier: "12.40", targetMultiplier: "11.50" },
    chickenCross: { completed: false, bestMultiplier: "8.25", targetMultiplier: "11.50" },
    spinDaBottle: { completed: false, currentStreak: 2, bestStreak: 3, targetStreak: 4 },
    qualified: false,
    qualifiedAt: null,
    isWinner: false,
  },
};

describe("ArkadeCampaignBadge", () => {
  beforeEach(() => {
    mockUseCampaign.mockReset();
    mockUseCampaign.mockReturnValue({ data: journey });
  });

  it("does not mount the private campaign query until the player identity is known", () => {
    const { container } = render(<ArkadeCampaignBadge enabled playerId={null} />);

    expect(container).toBeEmptyDOMElement();
    expect(mockUseCampaign).not.toHaveBeenCalled();
  });

  it("shows exact progress and campaign rules in the shared game modal", () => {
    render(<ArkadeCampaignBadge enabled playerId="player-1" />);
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
    mockUseCampaign.mockReturnValue({
      data: {
        ...journey,
        progress: {
          ...journey.progress,
          chickenCross: { ...journey.progress.chickenCross, completed: true },
          spinDaBottle: { ...journey.progress.spinDaBottle, completed: true },
          qualified: true,
          qualifiedAt: "2026-09-30T00:00:00Z",
        },
      },
    });

    render(<ArkadeCampaignBadge enabled playerId="player-1" />);
    expect(screen.getByRole("button", { name: /entry secured/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /entry secured/i }));
    expect(screen.getByText("Your draw entry is secured")).toBeInTheDocument();
    expect(screen.getByLabelText("3 of 3 missions complete")).toBeInTheDocument();
  });
});
