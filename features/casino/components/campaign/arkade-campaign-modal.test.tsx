import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { campaignJourney } from "./campaign-fixture";
import { ArkadeCampaignModal } from "./arkade-campaign-modal";

const shell = vi.hoisted(() => ({ panelClassName: "" }));
vi.mock("@/components/ui/modal-shell", () => ({
  ModalShell: ({
    open,
    children,
    panelClassName,
  }: {
    open: boolean;
    children: React.ReactNode;
    panelClassName?: string;
  }) => {
    shell.panelClassName = panelClassName ?? "";
    return open ? <div role="dialog">{children}</div> : null;
  },
}));

// The modal used to be a 360px phone sheet at every width. From md it is a
// landscape panel: the prize, clock and progress on one side, the missions
// on the other. Same DOM, so the two cannot drift apart in content.
describe("ArkadeCampaignModal", () => {
  it("asks the shell for the landscape panel", () => {
    render(
      <ArkadeCampaignModal open onClose={() => {}} journey={campaignJourney} seconds={3600} />
    );
    expect(shell.panelClassName).toMatch(/panel/);
    expect(shell.panelClassName).toMatch(/landscape/i);
  });

  it("lays the body out as a hero column and a missions column", () => {
    render(
      <ArkadeCampaignModal open onClose={() => {}} journey={campaignJourney} seconds={3600} />
    );
    const dialog = screen.getByRole("dialog");
    const hero = dialog.querySelector("[data-column='hero']");
    const missions = dialog.querySelector("[data-column='missions']");
    expect(hero).not.toBeNull();
    expect(missions).not.toBeNull();
    expect(hero?.textContent).toContain("Complete all 3 missions");
    expect(missions?.textContent).toContain("Chicken Cross");
    expect(missions?.textContent).toContain("Fair draw details");
  });

  it("renders nothing while closed", () => {
    render(
      <ArkadeCampaignModal open={false} onClose={() => {}} journey={campaignJourney} seconds={1} />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
