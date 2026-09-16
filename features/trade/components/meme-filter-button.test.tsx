import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import enMessages from "@/messages/en.json";
import { MemeFilterButton } from "@/features/trade/components/meme-filter-button";
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
  it("opens the risk panel on click and closes it on a second click, past its exit animation", async () => {
    renderButton();
    const trigger = screen.getByRole("button", { name: "Filters" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();

    fireEvent.click(trigger);
    // The panel plays an exit animation before it unmounts rather than
    // vanishing on the same tick.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes on Escape and on an outside click", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("toggles a risk level through the panel without closing it", () => {
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
