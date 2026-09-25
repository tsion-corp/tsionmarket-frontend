import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { MODAL_PANEL_CLASS, MemeSortMenu } from "@/features/trade/components/meme-sort-menu";
import type { ScreenerSort } from "@/lib/meme/screener";

// The screener's sort control (ADR-2026-09-15-meme-trending-screener §3): a
// menu of "Default order" and the seven metrics, with a direction pair once a
// sort is in force. It opens in a modal on the desk and on the phone alike.

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
  return {
    trigger,
    dialog: screen.getByRole("dialog", { name: "Sort coins" }),
    menu: screen.getByRole("menu", { name: "Sort coins" }),
  };
}

/** The shell's backdrop: the element the marked panel sits in. */
function backdrop() {
  const panel = document.querySelector(`.${MODAL_PANEL_CLASS}`)?.parentElement;
  if (!panel) throw new Error("the modal has no backdrop");
  return panel;
}

describe("MemeSortMenu", () => {
  it("names the trigger Sort until a sort is applied, then names the sort", () => {
    renderMenu(null);
    const trigger = screen.getByRole("button", { name: "Sort" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
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

  it("opens a titled modal dialog outside the toolbar, on the desk as on the phone", () => {
    renderMenu(null);
    const { trigger, dialog, menu } = openMenu();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(menu);
    // Portalled, so nothing in the toolbar can clip or stack over it.
    expect(trigger.parentElement).not.toContainElement(dialog);
  });

  it("lists the default order and the seven metrics, with the current one checked and focused", () => {
    renderMenu(null);
    const { menu } = openMenu();
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

  it("keeps Tab inside the dialog rather than letting it reach the page behind", () => {
    renderMenu(null);
    const { menu } = openMenu();
    // Two stops: the shell's close button, then the menu, which is one stop
    // because every item but the current one sits at tabindex -1.
    const current = within(menu).getByRole("menuitemradio", { name: "Default order" });
    const dismiss = screen.getByRole("button", { name: "Close" });
    expect(current).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(dismiss).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(current).toHaveFocus();

    // Focus parked outside the dialog is pulled back in on the next Tab.
    screen.getByRole("button", { name: "Outside" }).focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(dismiss).toHaveFocus();
  });

  it("closes on Escape with focus back on the trigger", async () => {
    renderMenu(null);
    const { trigger } = openMenu();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes on the shell's close button with focus back on the trigger", async () => {
    renderMenu(null);
    const { trigger } = openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes on a press on the backdrop, with focus back on the trigger", async () => {
    renderMenu(null);
    const { trigger } = openMenu();
    fireEvent.click(backdrop());
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("stays open when the press lands inside the menu", () => {
    renderMenu(null);
    const { menu } = openMenu();
    fireEvent.click(menu);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("opens the same modal on the phone", async () => {
    const { onSortChange } = renderMenu(null, "phone");
    const { trigger, dialog, menu } = openMenu();
    expect(trigger.parentElement).not.toContainElement(dialog);

    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Price" }));
    expect(onSortChange).toHaveBeenCalledWith({ by: "price", order: "desc" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes the phone modal on Escape", async () => {
    renderMenu(null, "phone");
    openMenu();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
