import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import { PortfolioFab } from "@/features/portfolio/components/portfolio-fab";

// Every label is read from the shipped catalogue, so a key renamed out from
// under the dial fails here rather than reaching a phone as a raw key.
function renderFab(overrides: Partial<Parameters<typeof PortfolioFab>[0]> = {}) {
  const onOpenFunds = vi.fn();
  const onOpenWithdraw = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PortfolioFab onOpenFunds={onOpenFunds} onOpenWithdraw={onOpenWithdraw} {...overrides} />
    </NextIntlClientProvider>
  );
  return { onOpenFunds, onOpenWithdraw };
}

function trigger() {
  return screen.getByRole("button", { name: "Quick actions" });
}

afterEach(cleanup);

describe("PortfolioFab", () => {
  it("starts closed, with the two actions out of reach", () => {
    renderFab();

    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Add funds" })).toHaveClass("pointer-events-none");
    expect(screen.getByRole("button", { name: "Withdraw" })).toHaveClass("pointer-events-none");
  });

  it("opens the dial and renames the trigger for what it now does", () => {
    renderFab();

    fireEvent.click(trigger());

    const open = screen.getByRole("button", { name: "Close quick actions" });
    expect(open).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Add funds" })).toHaveClass("pointer-events-auto");
  });

  // The dial closes before the modal opens, so the scrim is never left sitting
  // under a sheet with no way to reach it.
  it("closes the dial as it opens the deposit flow", () => {
    const { onOpenFunds } = renderFab();
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));

    expect(onOpenFunds).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Quick actions" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("closes the dial as it opens the withdraw flow", () => {
    const { onOpenWithdraw } = renderFab();
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    expect(onOpenWithdraw).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Quick actions" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("dismisses on the scrim without running either action", () => {
    const { onOpenFunds, onOpenWithdraw } = renderFab();
    fireEvent.click(trigger());

    fireEvent.click(screen.getByTestId("fab-scrim"));

    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(onOpenFunds).not.toHaveBeenCalled();
    expect(onOpenWithdraw).not.toHaveBeenCalled();
  });

  // The scrim has to cover the chrome it is dimming. The tab bar sits at z-90
  // and the support launcher at z-80: under those the dial dims the page while
  // leaving both lit and tappable, so a tap meant to dismiss navigates instead
  // and the dial follows the user to the next page. The dial itself stays
  // under the support chat panel (95) and every modal (300).
  // The trigger is the only control on the dial with no visible label, so its
  // accessible name is the whole of what a screen reader gets. It was written
  // in English in the markup: rendering the same component under another
  // locale is the only way to see that.
  it("names the trigger from the catalogue rather than the markup", () => {
    render(
      <NextIntlClientProvider locale="de" messages={de}>
        <PortfolioFab onOpenFunds={vi.fn()} onOpenWithdraw={vi.fn()} />
      </NextIntlClientProvider>
    );

    const trigger = screen.getByRole("button", { name: "Schnellaktionen" });
    fireEvent.click(trigger);

    expect(screen.getByRole("button", { name: "Schnellaktionen schließen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Geld einzahlen" })).toBeInTheDocument();
  });

  it("lays its scrim over the tab bar and the support launcher", () => {
    renderFab();

    expect(screen.getByTestId("fab-scrim")).toHaveClass("z-[91]");
    expect(trigger().parentElement).toHaveClass("z-[92]");
  });
});
