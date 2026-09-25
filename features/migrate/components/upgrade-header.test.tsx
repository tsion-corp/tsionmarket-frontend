// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import { UpgradeHeader } from "@/features/migrate/components/upgrade-header";

/*
  The design draws one card in three states: an announcement with an
  estimated time, one bar with a line under it, and the finished bar. The
  three-step rail it replaces is gone.
*/
describe("the upgrade modal's header", () => {
  it("announces the update with the estimated time, and no bar", () => {
    render(<UpgradeHeader view={{ phase: "intro", pct: 0, caption: null, step: null }} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("updateTitle");
    expect(screen.getByText("estimatedTime")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("says finish, not start, when reopened from the account menu", () => {
    render(
      <UpgradeHeader
        view={{ phase: "intro", pct: 0, caption: null, step: null }}
        variant="finish"
      />
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("finishTitle");
  });

  it("draws one bar with what is happening under it", () => {
    render(
      <UpgradeHeader
        view={{ phase: "progress", pct: 55, caption: "captionMoving", step: { done: 2, total: 4 } }}
      />
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("updatingTitle");
    expect(screen.getByText("inProgress")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "55");
    expect(bar.firstElementChild).toHaveStyle({ width: "55%" });
    // No count: "2 of 4" invites watching money move; the line just says
    // what is happening.
    expect(screen.getByText("captionMoving")).toBeInTheDocument();
    // The old three-step rail is gone for good.
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("fills the bar and says so when done, under the done art", () => {
    const { container } = render(
      <UpgradeHeader view={{ phase: "done", pct: 100, caption: "updateComplete", step: null }} />
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("readyTitle");
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("updateComplete")).toBeInTheDocument();
    expect(container.querySelector("img[src='/migrate/upgrade-done.svg']")).not.toBeNull();
  });
});
