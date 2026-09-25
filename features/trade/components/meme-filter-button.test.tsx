import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";
import { MemeFilterButton } from "@/features/trade/components/meme-filter-button";
import { MODAL_PANEL_CLASS } from "@/features/trade/components/meme-sort-menu";
import type { TokenRiskLevel } from "@/lib/meme/api";

const messages = enMessages;

function Wrap({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderButton(active: Set<TokenRiskLevel> = new Set()) {
  const onToggle = vi.fn();
  const onClear = vi.fn();
  render(
    <Wrap>
      <MemeFilterButton active={active} onToggle={onToggle} onClear={onClear} counts={new Map()} />
    </Wrap>
  );
  return { onToggle, onClear };
}

describe("MemeFilterButton", () => {
  it("opens the risk modal on click and closes it on a second click, past its exit animation", async () => {
    renderButton();
    const trigger = screen.getByRole("button", { name: "Filters" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    // Portalled, so nothing in the catalogue header can clip or stack over it.
    expect(trigger.parentElement).not.toContainElement(dialog);
    expect(dialog).toHaveFocus();

    fireEvent.click(trigger);
    // The modal plays an exit animation before it unmounts rather than
    // vanishing on the same tick.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes on Escape, on the close button and on the backdrop, returning focus to the trigger", async () => {
    renderButton();
    const trigger = screen.getByRole("button", { name: /^Filters$/ });

    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    const panel = document.querySelector(`.${MODAL_PANEL_CLASS}`)?.parentElement;
    if (!panel) throw new Error("the modal has no backdrop");
    fireEvent.click(panel);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps Tab inside the dialog rather than letting it reach the page behind", () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const dismiss = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: /Critical/ });

    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(dismiss).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("toggles a risk level through the modal without closing it", () => {
    const { onToggle } = renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: /Low risk/ }));
    expect(onToggle).toHaveBeenCalledWith("LOW");
    // Picking a risk band is not a close action.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the active count badge on the trigger", () => {
    renderButton(new Set<TokenRiskLevel>(["LOW", "HIGH"]));
    const trigger = screen.getByRole("button", { name: /^Filters/ });
    expect(trigger).toHaveTextContent("2");
  });
});
