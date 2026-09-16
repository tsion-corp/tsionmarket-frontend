import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { MemeSortMenu } from "@/features/trade/components/meme-sort-menu";
import type { ScreenerSort } from "@/lib/meme/screener";

// The screener's sort control (ADR-2026-09-15-meme-trending-screener §3): a
// menu of "Default order" and the seven metrics, with a direction pair once a
// sort is in force. A popover on the desk, a bottom sheet on the phone.

function renderMenu(sort: ScreenerSort | null, variant: "desk" | "phone" = "desk") {
  const onSortChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <button type="button">Outside</button>
      <MemeSortMenu variant={variant} sort={sort} onSortChange={onSortChange} />
    </NextIntlClientProvider>
  );
  return { onSortChange };
}

function openMenu() {
  const trigger = screen.getByRole("button", { name: /^Sort/ });
  fireEvent.click(trigger);
  return { trigger, menu: screen.getByRole("menu", { name: "Sort coins" }) };
}

describe("MemeSortMenu", () => {
  it("names the trigger Sort until a sort is applied, then names the sort", () => {
    renderMenu(null);
    const trigger = screen.getByRole("button", { name: "Sort" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("reads an applied sort in words after a hidden Sort, so the name still says what the button is", () => {
    renderMenu({ by: "volume", order: "desc" });
    expect(screen.getByRole("button", { name: "Sort Volume, High to low" })).toBeInTheDocument();
  });

  it("says Newest first for age ascending", () => {
    renderMenu({ by: "age", order: "asc" });
    expect(screen.getByRole("button", { name: "Sort Age, Newest first" })).toBeInTheDocument();
  });

  it("lists the default order and the seven metrics, with the current one checked and focused", () => {
    renderMenu(null);
    const { trigger, menu } = openMenu();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "Default order",
      "Market cap",
      "Price",
      "Age",
      "Transactions",
      "Volume",
      "Traders",
      "Liquidity",
    ]);
    const checked = items.filter((item) => item.getAttribute("aria-checked") === "true");
    expect(checked).toEqual([items[0]]);
    expect(items[0]).toHaveFocus();
    // No direction pair before a sort is chosen.
    expect(within(menu).queryByRole("menuitemradio", { name: "High to low" })).toBeNull();
  });

  it("sorts a metric high to low, closes, and hands focus back to the trigger", async () => {
    const { onSortChange } = renderMenu(null);
    const { trigger, menu } = openMenu();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Volume" }));
    expect(onSortChange).toHaveBeenCalledWith({ by: "volume", order: "desc" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("starts a sort by age at newest first", () => {
    const { onSortChange } = renderMenu({ by: "volume", order: "desc" });
    const { menu } = openMenu();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Age" }));
    expect(onSortChange).toHaveBeenCalledWith({ by: "age", order: "asc" });
  });

  it("does not report a change when the metric already in force is picked again", async () => {
    const { onSortChange } = renderMenu({ by: "volume", order: "desc" });
    const { menu } = openMenu();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Volume" }));
    expect(onSortChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("goes back to the default order", () => {
    const { onSortChange } = renderMenu({ by: "traders", order: "desc" });
    const { menu } = openMenu();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Default order" }));
    expect(onSortChange).toHaveBeenCalledWith(null);
  });

  it("flips the direction of the sort in force and stays open", () => {
    const { onSortChange } = renderMenu({ by: "volume", order: "desc" });
    const { menu } = openMenu();
    const direction = within(menu).getByRole("group", { name: "Volume" });
    const desc = within(direction).getByRole("menuitemradio", { name: "High to low" });
    const asc = within(direction).getByRole("menuitemradio", { name: "Low to high" });
    expect(desc).toHaveAttribute("aria-checked", "true");
    expect(asc).toHaveAttribute("aria-checked", "false");

    fireEvent.click(desc);
    expect(onSortChange).not.toHaveBeenCalled();
    fireEvent.click(asc);
    expect(onSortChange).toHaveBeenCalledWith({ by: "volume", order: "asc" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("names age's directions newest and oldest", () => {
    const { onSortChange } = renderMenu({ by: "age", order: "asc" });
    const { menu } = openMenu();
    expect(within(menu).getByRole("menuitemradio", { name: "Newest first" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Oldest first" }));
    expect(onSortChange).toHaveBeenCalledWith({ by: "age", order: "desc" });
  });

  it("moves focus with the arrow keys, Home and End, wrapping at both ends", () => {
    renderMenu({ by: "liquidity", order: "desc" });
    const { menu } = openMenu();
    const items = within(menu).getAllByRole("menuitemradio");
    // Eight sort items and the two directions.
    expect(items).toHaveLength(10);
    const liquidity = within(menu).getByRole("menuitemradio", { name: "Liquidity" });
    expect(liquidity).toHaveFocus();

    fireEvent.keyDown(liquidity, { key: "ArrowDown" });
    expect(within(menu).getByRole("menuitemradio", { name: "High to low" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? menu, { key: "End" });
    expect(items[9]).toHaveFocus();
    fireEvent.keyDown(items[9], { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "ArrowUp" });
    expect(items[9]).toHaveFocus();
    fireEvent.keyDown(items[9], { key: "Home" });
    expect(items[0]).toHaveFocus();
  });

  it("closes on Escape with focus back on the trigger", async () => {
    renderMenu(null);
    const { trigger } = openMenu();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes on a press outside, leaving focus where the press put it", async () => {
    renderMenu(null);
    openMenu();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("stays open when the press lands inside the menu", () => {
    renderMenu(null);
    const { menu } = openMenu();
    fireEvent.mouseDown(menu);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("opens as a bottom sheet on the phone", async () => {
    const { onSortChange } = renderMenu(null, "phone");
    const { trigger, menu } = openMenu();
    const sheet = screen.getByRole("dialog", { name: "Sort coins" });
    expect(sheet).toContainElement(menu);
    // The sheet is portalled to the body, outside the trigger's wrapper.
    expect(trigger.parentElement).not.toContainElement(sheet);

    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Price" }));
    expect(onSortChange).toHaveBeenCalledWith({ by: "price", order: "desc" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes the phone sheet on Escape", async () => {
    renderMenu(null, "phone");
    openMenu();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
