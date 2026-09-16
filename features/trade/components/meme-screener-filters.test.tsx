import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { MemeScreenerFilters } from "@/features/trade/components/meme-screener-filters";
import { EMPTY_FILTERS, type ScreenerFilters, type ScreenerPresetId } from "@/lib/meme/screener";

// The screener's Filters control (ADR-2026-09-15-meme-trending-screener §3):
// quick picks, then seven min/max rows held as a local draft. Nothing reaches
// the screener until Apply, so typing never costs a request.

function renderFilters({
  filters = EMPTY_FILTERS,
  count = 0,
  preset = null,
  variant = "desk",
}: {
  filters?: ScreenerFilters;
  count?: number;
  preset?: ScreenerPresetId | null;
  variant?: "desk" | "phone";
} = {}) {
  const onApply = vi.fn();
  const onPreset = vi.fn();
  const props = { variant, filters, count, preset, onApply, onPreset } as const;
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <button type="button">Outside</button>
      <MemeScreenerFilters {...props} />
    </NextIntlClientProvider>
  );
  const rerender = (next: Partial<typeof props>) =>
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <button type="button">Outside</button>
        <MemeScreenerFilters {...props} {...next} />
      </NextIntlClientProvider>
    );
  return { onApply, onPreset, rerender };
}

function openPanel() {
  const trigger = screen.getByRole("button", { name: /^Filters/ });
  fireEvent.click(trigger);
  return { trigger, panel: screen.getByRole("dialog", { name: "Filter coins" }) };
}

function field(name: string) {
  return screen.getByRole("textbox", { name });
}

function type(name: string, value: string) {
  fireEvent.change(field(name), { target: { value } });
}

describe("MemeScreenerFilters", () => {
  it("shows no badge with nothing applied", () => {
    renderFilters();
    const trigger = screen.getByRole("button", { name: "Filters" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("carries the applied count in the badge and in the name", () => {
    renderFilters({ count: 3 });
    const trigger = screen.getByRole("button", { name: "Filters 3 active" });
    expect(within(trigger).getByText("3")).toHaveAttribute("aria-hidden", "true");
  });

  it("opens seeded from the applied filters, with one hint for every row", () => {
    renderFilters({
      filters: { bounds: { marketCap: { max: "1000000" }, age: { min: "5" } }, sort: null },
    });
    const { trigger } = openPanel();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(field("Market cap (USD) Max")).toHaveValue("1000000");
    expect(field("Market cap (USD) Min")).toHaveValue("");
    expect(field("Age (minutes) Min")).toHaveValue("5");
    expect(screen.getAllByRole("textbox")).toHaveLength(14);
    for (const input of screen.getAllByRole("textbox")) {
      expect(input).toHaveAttribute("inputMode", "decimal");
      expect(input.getAttribute("placeholder")).not.toBe("");
    }
    expect(screen.getAllByText("Use plain numbers, or k, m and b, like 250k.")).toHaveLength(1);
  });

  it("marks the quick pick in force and applies another, closing the panel", async () => {
    const { onPreset, onApply } = renderFilters({ preset: "micro" });
    const { panel, trigger } = openPanel();
    const picks = within(panel).getByRole("group", { name: "Quick picks" });
    const chips = within(picks).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      expect.stringContaining("Fresh launches"),
      expect.stringContaining("Big movers"),
      expect.stringContaining("Micro caps"),
      expect.stringContaining("Deep liquidity"),
      expect.stringContaining("Crowd favourites"),
    ]);
    expect(within(picks).getByRole("button", { name: "Micro caps" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(picks).getByRole("button", { name: "Big movers" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    fireEvent.click(within(picks).getByRole("button", { name: "Big movers" }));
    expect(onPreset).toHaveBeenCalledWith("movers");
    expect(onApply).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("never calls out while typing, and applies k, m, b and commas as canonical bounds", async () => {
    const { onApply, onPreset } = renderFilters();
    const { trigger } = openPanel();
    type("Market cap (USD) Min", "250k");
    type("Market cap (USD) Max", "1.5M");
    type("Liquidity (USD) Min", "1,000");
    type("Volume (USD) Max", "2b");
    type("Price (USD) Min", " 0.00001 ");
    expect(onApply).not.toHaveBeenCalled();
    expect(onPreset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      marketCap: { min: "250000", max: "1500000" },
      liquidity: { min: "1000" },
      volume: { max: "2000000000" },
      price: { min: "0.00001" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("flags a field that is not a number and blocks Apply until it is fixed", () => {
    const { onApply } = renderFilters();
    openPanel();
    type("Traders Min", "lots");
    const input = field("Traders Min");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveClass("ws-invalid");
    const error = screen.getByText("Enter a number, like 250k.");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    // The other field in the row is still fine.
    expect(field("Traders Max")).toHaveAttribute("aria-invalid", "false");

    type("Traders Min", "50");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveClass("ws-invalid");
    expect(screen.queryByText("Enter a number, like 250k.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ traders: { min: "50" } });
  });

  it("reports a min above its max on the min, compared exactly", () => {
    renderFilters();
    openPanel();
    type("Price (USD) Min", "0.000011");
    type("Price (USD) Max", "0.00001");
    const min = field("Price (USD) Min");
    expect(min).toHaveAttribute("aria-invalid", "true");
    expect(field("Price (USD) Max")).toHaveAttribute("aria-invalid", "false");
    const error = screen.getByText("Min can't be above max.");
    expect(min.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("applies on Enter when the draft is valid, and not when it is invalid", () => {
    const { onApply } = renderFilters();
    const { panel } = openPanel();
    const form = panel.querySelector("form");
    if (form === null) throw new Error("the panel has no form");
    type("Transactions Min", "abc");
    fireEvent.submit(form);
    expect(onApply).not.toHaveBeenCalled();
    type("Transactions Min", "10k");
    fireEvent.submit(form);
    expect(onApply).toHaveBeenCalledWith({ transactions: { min: "10000" } });
  });

  it("resets the draft only, so nothing changes until Apply", () => {
    const { onApply } = renderFilters({
      filters: { bounds: { liquidity: { min: "10000" } }, sort: { by: "volume", order: "desc" } },
    });
    openPanel();
    type("Age (minutes) Max", "60");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(field("Liquidity (USD) Min")).toHaveValue("");
    expect(field("Age (minutes) Max")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({});
  });

  it("discards the draft on Escape and reseeds from the applied filters on the next open", async () => {
    const { onApply, rerender } = renderFilters();
    const { trigger } = openPanel();
    type("Volume (USD) Min", "5k");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(onApply).not.toHaveBeenCalled();

    rerender({ filters: { bounds: { volume: { max: "900" } }, sort: null } });
    openPanel();
    expect(field("Volume (USD) Min")).toHaveValue("");
    expect(field("Volume (USD) Max")).toHaveValue("900");
  });

  it("closes on a press outside, and not on one inside", async () => {
    renderFilters();
    const { panel } = openPanel();
    fireEvent.mouseDown(field("Price (USD) Min"));
    expect(panel).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("scrolls inside a 340px popover on the desk", () => {
    renderFilters();
    const { panel } = openPanel();
    expect(panel.className).toContain("w-[340px]");
    expect(panel.className).toContain("max-h-[min(70vh,560px)]");
    expect(panel.querySelector(".overflow-y-auto")).not.toBeNull();
  });

  it("opens as a bottom sheet on the phone and applies from it", async () => {
    const { onApply } = renderFilters({ variant: "phone" });
    const { trigger, panel } = openPanel();
    expect(trigger.parentElement).not.toContainElement(panel);
    expect(panel).toHaveAttribute("aria-modal", "true");
    type("Market cap (USD) Max", "1m");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ marketCap: { max: "1000000" } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
