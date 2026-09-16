"use client";

import type { TradeSide } from "@/lib/trade/side";

export type { TradeSide };

/** Which leg of a ticket is being entered. */
export interface TradeSideSwitchLabels {
  /** Names the pair of pills as the one choice they are. */
  group: string;
  buy: string;
  sell: string;
}

export interface TradeSideSwitchProps {
  side: TradeSide;
  onChange: (side: TradeSide) => void;
  /**
   * Finished strings. This primitive knows nothing about the message
   * catalogue, so each desk binds its own namespace and hands the wording in.
   */
  labels: TradeSideSwitchLabels;
  /** Set while an order is in flight, so the side cannot move under a signature. */
  disabled?: boolean;
}

// The BUY / SELL switch above a ticket's amount field.
//
// It exists because a ticket has ONE amount field and the two legs are
// denominated in different assets: a buy is entered in USDC, a sell in the coin
// being sold. Without a switch the field has to pick one, and the other leg
// then reads a number that means something else entirely. That is the bug this
// component was added to remove, so the switch is not decoration: it is what
// tells the field which asset it is counting.
//
// Styled as the meme board's switcher (meme-board.tsx, meme-desktop-board.tsx):
// a filled track holding two pills, so the desks read the same way.
export function TradeSideSwitch({
  side,
  onChange,
  labels,
  disabled = false,
}: TradeSideSwitchProps) {
  const buying = side === "buy";

  return (
    // A radiogroup rather than two buttons: it is one choice with two states,
    // and a screen reader should hear it as such. The meme board uses
    // aria-pressed, which reads as two independent toggles; this is one
    // either/or choice, so it stays a radiogroup.
    <div
      role="radiogroup"
      aria-label={labels.group}
      className="bg-grey-800 flex gap-2 rounded-full p-2"
    >
      <SideButton
        label={labels.buy}
        selected={buying}
        tone="buy"
        disabled={disabled}
        onSelect={() => onChange("buy")}
      />
      <SideButton
        label={labels.sell}
        selected={!buying}
        tone="sell"
        disabled={disabled}
        onSelect={() => onChange("sell")}
      />
    </div>
  );
}

function SideButton({
  label,
  selected,
  tone,
  disabled,
  onSelect,
}: {
  label: string;
  selected: boolean;
  tone: TradeSide;
  disabled: boolean;
  onSelect: () => void;
}) {
  // The action tokens, never the price-delta colours: this is a choice about
  // what you are doing, not a report of which way the market moved.
  const fill = tone === "buy" ? "bg-buy" : "bg-sell";

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      // Fill against outline, not one colour against another: the chosen half
      // is solid and the resting half is a bordered transparent pill, so the
      // state reads without relying on colour.
      className={`flex h-12 flex-1 cursor-pointer items-center justify-center rounded-full font-sans text-base font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? `${fill} text-white`
          : // Neither the fill nor the ink here maps to a token: the design uses
            // a near-black wash and a minted white for the resting half.
            "border border-white/8 bg-[rgba(54,54,54,0.16)] text-[#e9fff7]"
      }`}
    >
      {label}
    </button>
  );
}
