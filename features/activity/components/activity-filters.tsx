"use client";

import { useEffect, useId, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { MODAL_PANEL_CLASS, useModalTrigger } from "@/components/ui/modal-trigger";
import { SearchField } from "@/components/ui/search-field";
import type { ActivityProduct } from "@/lib/activity/feed";

// The header of the All Activity screen: one search box and two filter pills.
// It holds no data and runs no query. The view above it owns the state, applies
// it to the feed, and debounces the search, which is what keeps this file a
// control strip rather than a second copy of the list's logic.
//
// Figma: desktop 730:1288, phone 730:788 (file CkZb2luFfxbn5ptrVHng0n). Neither
// pill has an open state in the design and no node defines the menu contents,
// so the option sets below are ours: every product the view model can carry,
// and a conventional date range set.

// Where each product sits in the menu. A Record over the whole union rather
// than a list, so a product added to `ActivityProduct` fails to compile here
// until it is given a place. A filter that quietly stops offering a product the
// feed is already filing rows under is invisible from the screen.
//
// The six the design names come first, in its order; the three the view model
// carries that the design never drew follow.
const PRODUCT_ORDER: Record<ActivityProduct, number> = {
  predictions: 0,
  withdrawal: 1,
  memecoins: 2,
  deposit: 3,
  rewards: 4,
  arkade: 5,
  trade: 6,
  perps: 7,
  transfer: 8,
};

/** Every product the menu offers, in menu order. */
export const ACTIVITY_PRODUCTS: readonly ActivityProduct[] = (
  Object.keys(PRODUCT_ORDER) as ActivityProduct[]
).sort((a, b) => PRODUCT_ORDER[a] - PRODUCT_ORDER[b]);

/** A product filter, or `all` for the unfiltered default the pill rests on. */
export type ProductFilter = ActivityProduct | "all";

export const ACTIVITY_RANGES = ["7d", "30d", "90d", "12m", "all"] as const;
export type RangeFilter = (typeof ACTIVITY_RANGES)[number];

// How far back each range reaches, in days. `12m` is 365 days rather than a
// calendar year: the feed is a rolling history, so a fixed window is what a
// reader comparing two visits actually gets.
const RANGE_DAYS: Record<Exclude<RangeFilter, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The oldest instant a range still shows, or null when the range is unbounded.
 * Pure and exported so the view's filter and its tests share one definition of
 * what "Last 30 Days" means.
 */
export function rangeFloor(range: RangeFilter, now: number): number | null {
  if (range === "all") return null;
  return now - RANGE_DAYS[range] * DAY_MS;
}

export interface ActivityFilterState {
  /** The raw search box contents. The view debounces before it filters. */
  query: string;
  product: ProductFilter;
  range: RangeFilter;
}

interface ActivityFiltersProps {
  value: ActivityFilterState;
  onChange: (next: ActivityFilterState) => void;
}

interface MenuOption<V extends string> {
  value: V;
  label: string;
}

interface FilterMenuProps<V extends string> {
  /** Modal heading, and the accessible name of both the trigger and the menu. */
  title: string;
  options: readonly MenuOption<V>[];
  value: V;
  onChange: (next: V) => void;
}

const PILL =
  "border-hairline bg-surface text-grey-100 flex h-10 cursor-pointer items-center gap-1.5 rounded-full border-2 px-4 font-sans text-[12px] font-semibold tracking-[-0.02em] md:h-12 md:gap-2 md:px-5 md:text-[15px]";

// The menu row, matching MemeSortMenu so the two read as one family: a full
// width radio item with the tick on the right.
const ROW =
  "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left font-sans text-[14px] font-medium text-white/70 outline-none transition-colors hover:bg-white/6 focus-visible:bg-white/6 aria-checked:text-white";

/**
 * One filter pill and the modal menu behind it.
 *
 * A modal rather than a popover for the same reason the memecoin sort menu is
 * one: the phone is a first class surface here, and a menu hanging off a pill
 * would be clipped by the toolbar it sits in. The focus trap, Escape handling
 * and focus return all come from `useModalTrigger`.
 */
function FilterMenu<V extends string>({ title, options, value, onChange }: FilterMenuProps<V>) {
  const { open, show, close, triggerRef, panelRef } = useModalTrigger();
  const dialogId = useId();
  const titleId = useId();
  const current = options.find((option) => option.value === value);

  // Focus lands on the option in force, so Enter on an unchanged menu is a
  // no-op and the reader can see what they picked last time.
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("[data-current]")?.focus();
  }, [open, panelRef]);

  const pick = (next: V) => {
    if (next !== value) onChange(next);
    close(true);
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    );
    const at = items.findIndex((item) => item === document.activeElement);
    let next: number;
    if (e.key === "ArrowDown") next = (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = at <= 0 ? items.length - 1 : at - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    items[next]?.focus();
  };

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close(false) : show())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        // The pill shows only the selection, so the name of the filter itself
        // is carried here: "Last 30 Days" alone is a value with no subject.
        // An aria-label rather than a visually hidden span, because the span
        // would be a flex item of its own and would push the visible label off
        // centre by a gap and a space.
        aria-label={`${title}: ${current?.label ?? ""}`}
        className={PILL}
      >
        <span className="min-w-0 truncate">{current?.label ?? ""}</span>
        <ChevronDownIcon size={12} />
      </button>

      <ModalShell open={open} onClose={() => close(true)} panelClassName={MODAL_PANEL_CLASS}>
        <div
          ref={panelRef}
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="outline-none"
        >
          {/* Padded past the shell's close button so a long title never runs
              under it. */}
          <div id={titleId} className="ws-display mb-3 pr-10 text-[20px]">
            {title}
          </div>
          <div
            role="menu"
            aria-labelledby={titleId}
            onKeyDown={onMenuKey}
            className="flex flex-col"
          >
            {options.map((option) => {
              const checked = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  data-current={checked ? "" : undefined}
                  onClick={() => pick(option.value)}
                  className={ROW}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {checked ? (
                    <span aria-hidden className="shrink-0">
                      <CheckIcon size={16} className="text-accent" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </ModalShell>
    </div>
  );
}

export function ActivityFilters({ value, onChange }: ActivityFiltersProps) {
  const t = useTranslations("activity");

  // The product names come from `activity.products.*`, the same keys the row
  // prints on its time line. One name per product, so the pill and the row it
  // filters can never disagree about what a product is called.
  const productOptions: MenuOption<ProductFilter>[] = [
    { value: "all", label: t("filters.allProducts") },
    ...ACTIVITY_PRODUCTS.map((product) => ({
      value: product,
      label: t(`products.${product}`),
    })),
  ];

  const rangeOptions: MenuOption<RangeFilter>[] = ACTIVITY_RANGES.map((range) => ({
    value: range,
    label: t(`ranges.${range}`),
  }));

  return (
    <div className="flex flex-col gap-3">
      <SearchField
        value={value.query}
        onChange={(query) => onChange({ ...value, query })}
        label={t("filters.searchLabel")}
        placeholder={t("filters.searchPlaceholder")}
      />
      <div className="flex items-center gap-2 md:gap-2.5">
        <FilterMenu
          title={t("filters.productTitle")}
          options={productOptions}
          value={value.product}
          onChange={(product) => onChange({ ...value, product })}
        />
        <FilterMenu
          title={t("filters.rangeTitle")}
          options={rangeOptions}
          value={value.range}
          onChange={(range) => onChange({ ...value, range })}
        />
      </div>
    </div>
  );
}
