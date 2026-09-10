import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CurrencySelect, placeCurrencyPanel } from "@/components/ui/currency-select";
import { CURRENCIES, DEFAULT_CURRENCY, findCurrency } from "@/lib/currencies";

const USD = findCurrency(DEFAULT_CURRENCY)!;

/**
 * jsdom has no matchMedia and no layout. Both are stubbed so the desktop branch
 * of the picker can be exercised: the panel is positioned from the trigger's
 * box, which jsdom otherwise reports as all zeroes.
 */
function stubViewport({
  width = 1440,
  height = 900,
  desktop = true,
  trigger = { top: 160, bottom: 206, right: 652 },
}: {
  width?: number;
  height?: number;
  desktop?: boolean;
  trigger?: { top: number; bottom: number; right: number };
} = {}) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: desktop && query === "(min-width: 768px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: trigger.top,
    bottom: trigger.bottom,
    right: trigger.right,
    left: trigger.right - 120,
    width: 120,
    height: trigger.bottom - trigger.top,
    x: trigger.right - 120,
    y: trigger.top,
    toJSON: () => ({}),
  } as DOMRect);
}

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: "Display currency" }));
  return screen.getByRole("listbox");
}

describe("placeCurrencyPanel", () => {
  const viewport = { width: 1440, height: 900 };

  it("hangs the panel under the trigger when there is room below", () => {
    const place = placeCurrencyPanel({ top: 160, bottom: 206, right: 652 }, viewport);
    expect(place.top).toBe(214);
    expect(place.bottom).toBeUndefined();
    expect(place.maxHeight).toBe(360);
    // Right-aligned to the trigger, as the design draws it.
    expect(place.right).toBe(1440 - 652);
  });

  it("keeps the whole panel inside the window on a short viewport", () => {
    const short = { width: 1440, height: 620 };
    const place = placeCurrencyPanel({ top: 160, bottom: 206, right: 652 }, short);
    expect(place.top).toBeDefined();
    expect(place.top! + place.maxHeight).toBeLessThanOrEqual(short.height);
  });

  it("caps the height to the room below rather than to the design height", () => {
    // 300px of window under the trigger: 300 - 8 gap - 12 margin.
    const place = placeCurrencyPanel(
      { top: 160, bottom: 206, right: 652 },
      { ...viewport, height: 506 }
    );
    expect(place.maxHeight).toBe(280);
    expect(place.top! + place.maxHeight).toBeLessThanOrEqual(506);
  });

  it("flips above the trigger when below is too shallow and above is deeper", () => {
    // Trigger low in a short window: 100px under it, 500 over it.
    const place = placeCurrencyPanel(
      { top: 500, bottom: 546, right: 652 },
      { ...viewport, height: 646 }
    );
    expect(place.top).toBeUndefined();
    expect(place.bottom).toBe(646 - 500 + 8);
    expect(place.maxHeight).toBe(360);
    // Its far edge clears the top of the window.
    expect(646 - place.bottom! - place.maxHeight).toBeGreaterThanOrEqual(0);
  });

  it("stays on screen when neither side can hold a full list", () => {
    const tiny = { width: 1440, height: 320 };
    const place = placeCurrencyPanel({ top: 130, bottom: 176, right: 652 }, tiny);
    const start = place.top ?? tiny.height - place.bottom! - place.maxHeight;
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start + place.maxHeight).toBeLessThanOrEqual(tiny.height);
  });
});

describe("CurrencySelect", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubViewport();
  });

  it("escapes an ancestor that clips its overflow", () => {
    // The desktop balance card wraps this picker in a clipping box that also
    // seals its own stacking context. An absolutely positioned panel inside it
    // was cut off flat at the card's foot, so the panel is anchored to the
    // viewport and rendered outside the box.
    const { container } = render(
      <div style={{ overflow: "hidden", height: 300 }}>
        <CurrencySelect value={USD} onSelect={() => {}} size="lg" />
      </div>
    );
    const panel = openPicker();
    expect(container.contains(panel)).toBe(false);
    expect(panel.parentElement).toBe(document.body);
    // Tailwind classes carry no styles under jsdom, so the contract is read
    // off the class list and the inline placement: `fixed` takes the viewport
    // as its containing block, which `absolute` inside the clipping box did
    // not.
    expect(panel.className).toContain("fixed");
    expect(panel.className).not.toContain("absolute");
    expect(panel.style.top).toBe("214px");
    expect(panel.style.maxHeight).toBe("360px");
  });

  it("caps the panel to the space the window has, so its tail stays on screen", () => {
    stubViewport({ height: 520 });
    render(<CurrencySelect value={USD} onSelect={() => {}} size="lg" />);
    const panel = openPicker();
    const top = Number.parseFloat(panel.style.top);
    const maxHeight = Number.parseFloat(panel.style.maxHeight);
    expect(top + maxHeight).toBeLessThanOrEqual(520);
  });

  it("scrolls the list inside the panel rather than past it", () => {
    render(<CurrencySelect value={USD} onSelect={() => {}} size="lg" />);
    const panel = openPicker();
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(CURRENCIES.length);
    // Every option lives in one scroll container, so the last currency is
    // reachable however short the panel is.
    const list = options[0].parentElement!.parentElement!;
    expect(list.className).toContain("overflow-y-auto");
    expect(list.contains(options[options.length - 1])).toBe(true);
    expect(panel.contains(list)).toBe(true);
  });

  it("keeps the trigger and panel related for assistive tech", () => {
    render(<CurrencySelect value={USD} onSelect={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Display currency" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("listbox");
    // The panel is no longer a descendant of the trigger's box, so the two are
    // tied together explicitly instead.
    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.id).not.toBe("");
    // The search field keeps a name of its own.
    expect(screen.getByPlaceholderText("Search currency")).toBeInTheDocument();
  });

  it("closes on Escape and hands focus back to the trigger", async () => {
    render(<CurrencySelect value={USD} onSelect={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Display currency" });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // The panel plays an exit animation before it unmounts.
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });

  it("selects a currency, closes, and returns focus", async () => {
    const onSelect = vi.fn();
    render(<CurrencySelect value={USD} onSelect={onSelect} />);
    const trigger = screen.getByRole("button", { name: "Display currency" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: /NGN/ }));
    expect(onSelect).toHaveBeenCalledWith("NGN");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the phone bottom sheet when the viewport is not desktop", () => {
    stubViewport({ desktop: false, width: 390, height: 844 });
    render(<CurrencySelect value={USD} onSelect={() => {}} />);
    const panel = openPicker();
    // No measured placement: the sheet is pinned to the foot of the window by
    // its own classes.
    expect(panel.style.top).toBe("");
    expect(panel.className).toContain("bottom-0");
  });
});
