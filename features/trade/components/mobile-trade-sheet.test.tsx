import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { MobileTradeSheet } from "@/features/trade/components/mobile-trade-sheet";

// The phone trade screen hosts a chart and an order ticket, so the parts that
// matter here are the ones a keyboard or a screen reader depends on: what the
// sheet does with focus, what dismisses it, and whether the page behind it
// stays put.

function renderSheet(props: Partial<React.ComponentProps<typeof MobileTradeSheet>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MobileTradeSheet open title="BTC/USD" {...props} onClose={onClose}>
        <button type="button">ticket action</button>
      </MobileTradeSheet>
    </NextIntlClientProvider>
  );
  return { onClose, view };
}

beforeEach(() => {
  document.body.style.overflow = "";
});

describe("dismissal", () => {
  it("closes on Escape", () => {
    const { onClose } = renderSheet();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // A trade sheet opens on top of this one. Escape belongs to whichever dialog
  // is on top, or dismissing the money sheet also tears down the screen under
  // it and the user loses their place.
  it("leaves Escape to a dialog stacked above it", () => {
    const { onClose } = renderSheet();
    const above = document.createElement("div");
    above.setAttribute("role", "dialog");
    above.setAttribute("aria-modal", "true");
    document.body.append(above);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    above.remove();
  });

  it("locks the page behind it and restores the scroll on close", () => {
    const { view } = renderSheet();
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  // The consumers pass an inline arrow, so a fresh identity every render used
  // to re-run the lock effect and re-register the key listener each time.
  it("does not re-lock on every render of an unstable onClose", () => {
    const { view } = renderSheet({ onClose: () => {} });
    const locked = document.body.style.overflow;
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MobileTradeSheet open title="BTC/USD" onClose={() => {}}>
          <button type="button">ticket action</button>
        </MobileTradeSheet>
      </NextIntlClientProvider>
    );
    expect(document.body.style.overflow).toBe(locked);
    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("focus", () => {
  it("moves focus into the sheet and hands it back to the opener", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { view } = renderSheet();
    await waitFor(() =>
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true)
    );
    view.unmount();
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("keeps Tab inside the sheet", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])"
    );
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);
  });

  it("wraps backwards from the first focusable", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled])"
    );
    focusable[0].focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });
});

describe("touch targets", () => {
  it("gives the back control a 44px hit area", () => {
    renderSheet();
    const back = screen.getByRole("button", { name: messages.common.back });
    expect(back.className).toMatch(/size-11/);
  });

  it("gives the market list's close control a 44px hit area", () => {
    renderSheet({ marketPicker: () => <div>markets</div> });
    fireEvent.click(screen.getByRole("button", { name: "BTC/USD" }));
    const close = screen.getByRole("button", { name: messages.common.close });
    expect(close.className).toMatch(/size-11/);
  });
});
