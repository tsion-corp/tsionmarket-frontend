"use client";

// React 19 dropped the global JSX namespace; it lives on the react package now.
import type { JSX, Ref } from "react";
import { ButtonSpinner } from "@/components/ui/button-spinner";

/**
 * The arcade's right rail, as four interchangeable cards.
 *
 * Every card is the design's 295x372 flat #121314 panel: a pill badge, a
 * display heading, a grey sub-line, the card's own body, a pill button and —
 * handed in as the frame's footer — the dot pager that swaps between them,
 * drawn inside the card near its bottom edge.
 *
 * These are presentation and nothing else. No hook, no fetch, no translation
 * lookup and no QR generation lives here: every string and every node arrives
 * as a prop, already formatted and already localised by the rail that mounts
 * them. Money in particular is display-only — a card renders the string it is
 * handed and never does arithmetic on it, so no rounding can happen at the
 * last edge before a player reads a figure.
 */

export type RailTone = "lead" | "behind" | "waiting";

export interface StakeStepperProps {
  /** Already formatted for display, e.g. "$0.38". Never parsed here. */
  amount: string;
  currency: string;
  onDecrement(): void;
  onIncrement(): void;
  canDecrement: boolean;
  canIncrement: boolean;
  disabled?: boolean;
  /**
   * Accessible names for the two round buttons. The contract carried no slot
   * for them, and a hard-coded English name cannot be translated, so the rail
   * may hand localised ones down; without them the names fall back to the
   * card's own `amountLabel`.
   */
  decrementLabel?: string;
  incrementLabel?: string;
}

export interface RailBadge {
  label: string;
  tone: RailTone;
}

export interface RailActionCardProps {
  badge: RailBadge | null;
  heading: string;
  sub: string;
  amountLabel: string;
  stepper: StakeStepperProps;
  cta: { label: string; icon?: "play" | null; onPress(): void; disabled?: boolean; busy?: boolean };
  /** A handle on the action button, for a caller that animates something out
   *  of it. The wager's coin flight launches from this button's viewport box,
   *  and the button is drawn here rather than by the caller. */
  ctaRef?: Ref<HTMLButtonElement>;
  /** Pinned to the bottom of the card, inside it: the pager dots. */
  footer?: React.ReactNode;
}

export interface RailInviteCardProps {
  /**
   * The design's "You earn 10%" chip (B6). Not a status pill: it is a plain
   * 4%-white chip with no border and no dot, so it takes a label and nothing
   * else. Null leaves the heading row to the heading alone.
   */
  chip: string | null;
  heading: string;
  sub: string;
  /** The rail owns the code; the card only frames it in white. */
  qr: React.ReactNode;
  caption: string;
  share: { label: string; onPress(): void };
  /** Pinned to the bottom of the card, inside it: the pager dots. */
  footer?: React.ReactNode;
}

export interface RailClaimCardProps {
  heading: string;
  shareLabel: string;
  shareValue: string;
  status: { label: string; ready: boolean };
  rows: { label: string; value: string }[];
  cta: { label: string; onPress(): void; disabled?: boolean; busy?: boolean };
  /** Pinned to the bottom of the card, inside it: the pager dots. */
  footer?: React.ReactNode;
}

export interface RailCardFrameProps {
  children: React.ReactNode;
  /** Rendered pinned to the bottom of the card, inside it (the pager dots). */
  footer?: React.ReactNode;
  /** Optional accessible name for the card region. */
  label?: string;
}

export interface RailPagerProps {
  count: number;
  index: number;
  onSelect(i: number): void;
  /**
   * The whole accessible name for one dot, already translated: the caller
   * knows the language and the card's name, and a sentence assembled from
   * English fragments here would never reach the catalogues.
   */
  itemLabel(index: number, count: number): string;
}

// Every glyph on these cards is the Figma file's own export, committed byte for
// byte under this root with a `rail-` prefix: the crown on the lead pill
// (916:84255), the two stake steps (916:84239 / 916:84246), the play glyph on
// the start button (930:2009) and share-08 on the invite button (918:86280).
// The dots are the only marks drawn in CSS, because a filled circle is exactly
// what a rounded span is.
const ASSET_ROOT = "/casino/last-standing";

// The card shell. Spec §4: every rail card is the same surface as the stage
// card beside it — a flat #121314 panel at radius 15px with no border. Not
// ws-card, which is the shell's translucent white glass with a hairline and a
// lit top edge; that treatment belongs to a different screen and put a white
// rim around cards the design draws as solid panels.
//
// Full width at every breakpoint. It used to settle to the design's 295px from
// the small breakpoint until 980px, which on a tablet — where the rail is
// stacked full width under the stage — left the card hugging the left edge of
// its row and the rest of the row empty. The frame is the design's 295x372
// panel drawn at whatever width its column is.
//
// The five frames (916:84229, 916:84125, 929:1889, 844:79742, 918:86263) are
// all 372px tall, so that is the floor: paging between cards then never makes
// the rail jump. A floor and not a height, so a long translation grows the
// card rather than spilling out of it.
//
// No overflow-hidden: the pager's 44px targets reach 17px past its 10px dots,
// and the lowest 5px of that would otherwise be clipped off at the card edge.
const FRAME =
  "flex min-h-[372px] w-full max-w-full min-w-0 flex-col rounded-[15px] bg-[#121314] pb-3";

// The side and top insets differ per card, and each is the file's own:
// the action cards sit their header at x=12 y=17, the invite card at x=16
// (12px frame plus its 4px padding) y=28, the claim card at x=22 y=34.
type FramePad = "action" | "invite" | "claim";
const FRAME_PAD: Record<FramePad, string> = {
  action: "px-3 pt-[17px]",
  invite: "px-4 pt-7",
  claim: "px-[22px] pt-[34px]",
};

function Frame({
  children,
  footer,
  label,
  kind,
  pad,
}: RailCardFrameProps & { kind?: string; pad: FramePad }): JSX.Element {
  return (
    <section
      data-testid="rail-card-frame"
      data-rail-card={kind}
      aria-label={label}
      className={`${FRAME} ${FRAME_PAD[pad]}`}
    >
      <div className="flex min-w-0 flex-col">{children}</div>
      {footer != null ? (
        // 916:84230: the dot row is 10px tall at y=350 of 372, so it sits 12px
        // off the bottom (the frame's pb-3) and at least 18px under the button,
        // which ends at y=332. The pager's own 44px targets are pulled back to
        // that 10px row with a negative margin so they do not push it about.
        <div data-testid="rail-card-footer" className="mt-auto flex justify-center pt-[18px]">
          <div className="-my-[17px]">{footer}</div>
        </div>
      ) : null}
    </section>
  );
}

/** The shared card shell: #121314, radius 15, the design's padding, fills its column at every width. */
export function RailCardFrame({ children, footer, label }: RailCardFrameProps): JSX.Element {
  return (
    <Frame footer={footer} label={label} pad="action">
      {children}
    </Frame>
  );
}

// Both pills carry the design's own numbers rather than leaning on a shared
// utility. Angle, stops and both shadows are as drawn: the gradient is very
// nearly top-to-bottom but not exactly, and the half-pixel inset highlight is
// what gives the pill its lit top edge.
//
// The chrome one duplicates what ws-chrome-pill would paint because that
// utility is not this button: it also dresses the portfolio balance card, at
// 178.96deg with shadows twice these values (inset 1.24px / 0 2.49px 4.97px).
// Retuning it there to satisfy this card would move a screen nobody asked us
// to touch, so the Last Man's values live with the Last Man. The class stays on
// the element for its radius and as the shared treatment's name; these two
// properties are the ones the design disagrees with it about.
const PILL_SHADOW =
  "inset 0 0.619px 0 rgba(255, 255, 255, 0.95), 0 1.238px 2.477px rgba(0, 0, 0, 0.5)";

const AMBER_PILL: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(179.583deg, #ffe178 2.3594%, #f8d559 38.566%, #ffdf6e 62.387%, #fcd95e 97.641%)",
  boxShadow: PILL_SHADOW,
};

const CHROME_PILL: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(179.583deg, #ffffff 2.3594%, #ededf0 38.566%, #cbcbd1 62.387%, #f5f5f8 97.641%)",
  boxShadow: PILL_SHADOW,
};

// The design draws this button 31.798px tall with an 11px Mona Sans SemiBold
// label, which is what it is from 980px up, where the rail is a column of its
// own and the pointer is a mouse.
//
// Below that it keeps a 44px box. 31.798px clears WCAG 2.5.8's 24px minimum,
// so the design is not inaccessible, but it is under the 44px a finger wants
// and this is the button that takes the money. The design was drawn at 1339px
// and says nothing about a phone, so the height is the one thing here not
// taken from it. Everything else — face, size, weight, colour, radius — is.
//
// The horizontal padding is ours too: the design's 8.376px assumes the English
// label, and `px-4` keeps a German or Portuguese one off the pill's edge.
//
// Width: every card draws the button 229px wide on a 295px frame, a fixed
// inset from the card's edges rather than a fixed width, so each card states
// its own margins (see the call sites) and the pill grows with the card.
const PILL_BUTTON =
  "ws-pressable text-ink font-serif flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-full px-4 text-[11px] leading-[1.1] font-semibold disabled:cursor-not-allowed disabled:opacity-40 min-[980px]:min-h-[31.798px]";

// Amber when this wallet is ahead, the design's red when someone else is, 65%
// white before the first play. Border and label are one colour each, at full
// strength: the design's 0.742 on this pill is the border *width*, not an
// opacity, and reading it as one is what faded these pills out.
//
// The leading glyph is the tone's own, as drawn:
//   lead    916:84255, the crown, in an 8px box.
//   behind  916:84151, a 7.416px #ff745b dot.
//   waiting 930:2012, a 7px dot at 65% white — smaller than the other two.
// The claim card's "Ready to claim" pill (847:79800) is lead-coloured but
// carries a 7.416px #ffe178 dot, not the crown, so the glyph can be forced.
const BADGE_TONE: Record<RailTone, { chip: string; dot: string; glyph: "crown" | "dot" }> = {
  lead: {
    chip: "border-[#ffe178] text-[#ffe178]",
    dot: "size-[7.416px] bg-[#ffe178]",
    glyph: "crown",
  },
  behind: {
    chip: "border-[#ff745b] text-[#ff745b]",
    dot: "size-[7.416px] bg-[#ff745b]",
    glyph: "dot",
  },
  waiting: { chip: "border-white/65 text-white/65", dot: "size-[7px] bg-white/65", glyph: "dot" },
};

/**
 * B5, the outline status pill. `even` is the claim card's variant (847:79799),
 * which the design pads to 14.562px on both sides where the three header pills
 * take 12px on the left, and which always leads with a dot.
 */
function Badge({ label, tone, even = false }: RailBadge & { even?: boolean }): JSX.Element {
  const { chip, dot, glyph } = BADGE_TONE[tone];
  const crown = glyph === "crown" && !even;
  return (
    <span
      data-testid="rail-badge"
      data-tone={tone}
      // B5/T12: Quicksand Bold 8.494/9.708, a 0.742px border at radius
      // 30.337px. The label is as small as the design draws it, which is very
      // small; it is the design's call, not a constraint, so it is reproduced
      // rather than quietly rounded up.
      className={`ws-quick inline-flex max-w-full shrink-0 items-center gap-[4.854px] rounded-[30.337px] border-[0.742px] py-[6.067px] text-[8.494px] leading-[9.708px] ${even ? "px-[14.562px]" : "pr-[14.562px] pl-3"} ${chip}`}
    >
      {crown ? (
        // The crown's 6.5x7.167 artwork centred in the 8px box the design
        // reserves for it: the padding is that centring.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          data-testid="rail-badge-crown"
          src={`${ASSET_ROOT}/rail-crown.svg`}
          alt=""
          aria-hidden="true"
          width={8}
          height={8}
          className="block size-2 shrink-0 px-[0.75px] py-[0.417px]"
        />
      ) : (
        <span aria-hidden className={`shrink-0 rounded-full ${dot}`} />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * B6, the "You earn 10%" chip (918:86267). A 5%-white pill at radius 50px with
 * no border, no dot and a Mona Sans Bold label at 40% — a different element
 * from the status pill above, saying a different kind of thing.
 */
function Chip({ label }: { label: string }): JSX.Element {
  return (
    <span
      data-testid="rail-chip"
      className="inline-flex max-w-full shrink-0 items-center rounded-[50px] bg-white/[0.05] px-3 py-2 font-serif text-[11px] leading-[1.4] font-bold text-[#f4f4f4]/40"
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

// T16 at -0.96px, T17 at -0.48px: the file tracks "Claim Your Winnings" looser
// than "Add To Your Position" at the same 24px, so the tracking is the caller's
// to state rather than one value averaged across both.
function Heading({
  children,
  tracking = "tracking-[-0.96px]",
}: {
  children: React.ReactNode;
  tracking?: string;
}): JSX.Element {
  return (
    <h3 className={`ws-display text-[24px] leading-none ${tracking} text-[#f4f4f4]`}>{children}</h3>
  );
}

// T22: the invite card's heading is its own, smaller line — 15px on a 16px
// leading — not the 24px display the other three cards carry.
function InviteHeading({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h3 className="ws-display text-[15px] leading-4 tracking-normal text-[#f4f4f4]">{children}</h3>
  );
}

// T18 / T24. Mona Sans SemiBold, not the body face: every small label on these
// cards is Mona Sans in the design, and leaving them unset let them inherit
// Geist. The action card's line leads at 1.5 and sits 4px under its heading
// (916:84257, gap 4); the invite card's leads at 1.4 and sits 8px under
// (918:86264, gap 8), so both are the caller's.
function Sub({
  children,
  leading = "leading-[1.5]",
  gap = "mt-1",
}: {
  children: React.ReactNode;
  leading?: string;
  gap?: string;
}): JSX.Element {
  return (
    <p className={`${gap} font-serif text-[13px] ${leading} font-semibold text-[#f4f4f4]/40`}>
      {children}
    </p>
  );
}

// remove-circle / add-circle: the ring is part of the exported artwork, a 1px
// white stroke with the sign at 2.5 units inside a 34.333 viewBox, drawn in a
// 40px box whose 8.33% inset (less the stroke's overhang) is the padding here.
function StepGlyph({ sign }: { sign: "minus" | "plus" }): JSX.Element {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${ASSET_ROOT}/rail-${sign}.svg`}
      alt=""
      aria-hidden="true"
      width={40}
      height={40}
      className="block size-10 p-[2.833px]"
    />
  );
}

// play (930:2009): a 16px box, the 10.333x11 outline triangle centred in it.
function PlayGlyph(): JSX.Element {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-testid="rail-play-glyph"
      src={`${ASSET_ROOT}/rail-play.svg`}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      className="block size-4 shrink-0 px-[2.833px] py-[2.5px]"
    />
  );
}

// share-08 (918:86280): a 12px box, the 10x9.5 artwork in #141b34 centred in it.
function ShareGlyph(): JSX.Element {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-testid="rail-share-glyph"
      src={`${ASSET_ROOT}/rail-share.svg`}
      alt=""
      aria-hidden="true"
      width={12}
      height={12}
      className="block size-3 shrink-0 px-px py-[1.25px]"
    />
  );
}

// B3: a 40px box with no fill and no border of its own — the white ring is in
// the artwork. It had been drawn 44px, filled with `bg-surface` and rimmed in
// the shell's 12% hairline, which is three departures from a control the
// design draws as a plain white ring on the card.
const STEP_BUTTON =
  "ws-pressable grid size-10 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full disabled:cursor-not-allowed disabled:opacity-30";

// One row at every width: the two round buttons keep their 40px and the 36px
// the design clears on each side of the figure, and only the figure itself
// gives ground, so the stepper never wraps or overflows. 916:84237 wraps the
// row in 10px of padding, which is what puts it 22px under "Play Amount".
function StakeStepper({
  amount,
  currency,
  onDecrement,
  onIncrement,
  canDecrement,
  canIncrement,
  disabled,
  decrementLabel,
  incrementLabel,
  amountLabel,
}: StakeStepperProps & { amountLabel: string }): JSX.Element {
  return (
    <div className="mt-3 w-full p-2.5">
      <div className="flex w-full items-center justify-center gap-9">
        <button
          type="button"
          onClick={onDecrement}
          disabled={disabled === true || !canDecrement}
          aria-label={decrementLabel ?? `Decrease ${amountLabel}`}
          className={STEP_BUTTON}
        >
          <StepGlyph sign="minus" />
        </button>
        {/* T20/T21 (916:84243): the stake is the card's biggest figure at 36px
            Mona Sans Bold, 8px over "USD" in Mona Sans SemiBold. The design
            gives the column 93px, so that is its floor. */}
        <span className="flex min-w-0 flex-col items-center gap-2 text-center sm:min-w-[93px]">
          <span className="ws-display tnum block w-full truncate text-[36px] leading-none tracking-[-1.08px] text-[#ffe178]">
            {amount}
          </span>
          <span className="block font-serif text-[13px] leading-none font-semibold text-[#f4f4f4]/40">
            {currency}
          </span>
        </span>
        <button
          type="button"
          onClick={onIncrement}
          disabled={disabled === true || !canIncrement}
          aria-label={incrementLabel ?? `Increase ${amountLabel}`}
          className={STEP_BUTTON}
        >
          <StepGlyph sign="plus" />
        </button>
      </div>
    </div>
  );
}

// Busy locks the button as well as spinning it: a second press mid-transaction
// is how a player ends up paying their stake twice.
function PillButton({
  label,
  onPress,
  disabled,
  busy,
  tone,
  buttonRef,
  icon,
  iconSide = "before",
  place,
  labelClass,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  busy?: boolean;
  tone: "amber" | "chrome";
  buttonRef?: Ref<HTMLButtonElement>;
  icon?: React.ReactNode;
  /**
   * B1 leads with its glyph, B2 trails one. Two buttons that are the same pill
   * in every other respect, drawn with the icon on opposite sides — so which
   * side is the caller's to say, not a default to be assumed.
   */
  iconSide?: "before" | "after";
  /** The card's own margins around the pill: see each call site. */
  place: string;
  /** Size and tracking where a card's label departs from the 11px default. */
  labelClass?: string;
}): JSX.Element {
  const glyph = busy === true ? null : icon;
  const chrome = tone === "chrome" ? "ws-chrome-pill" : "";
  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={onPress}
      disabled={disabled === true || busy === true}
      style={tone === "amber" ? AMBER_PILL : CHROME_PILL}
      // The spaces matter: without them the tone's class welds onto the last
      // class of PILL_BUTTON and the browser drops both, leaving a #0a0a0a
      // label on a transparent pill over a #121314 card.
      className={`${place} ${labelClass ?? (tone === "chrome" ? "tracking-[-0.11px]" : "")} ${chrome} ${PILL_BUTTON}`}
    >
      {busy === true ? <ButtonSpinner /> : null}
      {iconSide === "before" ? glyph : null}
      {label}
      {iconSide === "after" ? glyph : null}
    </button>
  );
}

/** START and ADD: the badge, the stake stepper and the one action. */
export function RailActionCard({
  badge,
  heading,
  sub,
  amountLabel,
  stepper,
  cta,
  ctaRef,
  footer,
}: RailActionCardProps): JSX.Element {
  return (
    <Frame kind="action" pad="action" footer={footer}>
      {/* 916:84253: the pill, then 12px, then the heading block. */}
      {badge ? (
        <div className="mb-3 flex">
          <Badge {...badge} />
        </div>
      ) : null}
      {/* 916:84257 insets the heading and its line 4px from the pill's edge. */}
      <div className="px-1">
        <Heading>{heading}</Heading>
        <Sub>{sub}</Sub>
      </div>

      {/* 916:84234: 265px wide from x=12, so 6px further in on the right than
          the header, and 38px under it (y=157 against a header ending at
          y=119). The button is 229px of those 265, centred: 18px each side. */}
      <div className="mt-[38px] mr-1.5 flex flex-col">
        {/* T19 */}
        <p className="text-center font-serif text-[13px] leading-[1.4] font-semibold text-[#f4f4f4]/40">
          {amountLabel}
        </p>
        <StakeStepper {...stepper} amountLabel={amountLabel} />

        <PillButton
          label={cta.label}
          onPress={cta.onPress}
          disabled={cta.disabled}
          busy={cta.busy}
          tone="amber"
          buttonRef={ctaRef}
          place="mt-9 mx-[18px]"
          icon={cta.icon === "play" ? <PlayGlyph /> : null}
        />
      </div>
    </Frame>
  );
}

/** INVITE: the earn chip sits beside the heading, and the code fills a white tile. */
export function RailInviteCard({
  chip,
  heading,
  sub,
  qr,
  caption,
  share,
  footer,
}: RailInviteCardProps): JSX.Element {
  return (
    <Frame kind="invite" pad="invite" footer={footer}>
      <div className="flex items-center justify-between gap-3">
        <InviteHeading>{heading}</InviteHeading>
        {chip ? <Chip label={chip} /> : null}
      </div>
      {/* T24 leads at 1.4 where the action card's T18 leads at 1.5. */}
      <Sub leading="leading-[1.4]" gap="mt-2">
        {sub}
      </Sub>

      {/* 918:86274: 8px under the copy, the 128px tile over its caption. */}
      <div className="mt-2 flex flex-col items-center gap-2">
        {/* The code is drawn 128px square at radius 10px, and the tile's 8px
            padding is the quiet zone: a 112px code inside it makes the pair the
            design's 128. */}
        <div
          data-testid="rail-qr"
          className="grid size-32 max-w-full place-items-center overflow-hidden rounded-[10px] bg-white p-2"
        >
          {qr}
        </div>
        {/* T25 */}
        <p className="text-center font-serif text-[12px] leading-[1.4] font-semibold text-[#f4f4f4]/40">
          {caption}
        </p>
      </div>

      <PillButton
        label={share.label}
        onPress={share.onPress}
        tone="chrome"
        // 918:86277: y=300, 17px under the caption; 229px centred on the
        // 295px frame, so 33px from each edge — 17px past the 16px padding.
        place="mt-[17px] mx-[17px]"
        // B2 trails its glyph; B1 leads with one.
        icon={<ShareGlyph />}
        iconSide="after"
      />
    </Frame>
  );
}

/** CLAIM: the winner's share, the breakdown, and the button that settles it. */
export function RailClaimCard({
  heading,
  shareLabel,
  shareValue,
  status,
  rows,
  cta,
  footer,
}: RailClaimCardProps): JSX.Element {
  return (
    <Frame kind="claim" pad="claim" footer={footer}>
      {/* T17 tracks looser than the other rail headings at the same 24px. */}
      <Heading tracking="tracking-[-0.48px]">{heading}</Heading>

      {/* 847:79805 stacks heading, body and button 36px apart; 847:79804
          stacks the body's three parts 24px apart. */}
      <div className="mt-9 flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          {/* T26 / T27 */}
          <span className="font-serif text-[12px] leading-[1.4] font-semibold tracking-[-0.12px] text-[#f4f4f4]/40">
            {shareLabel}
          </span>
          <span className="ws-display tnum truncate text-[24px] leading-[1.2] tracking-normal text-[#f4f4f4]">
            {shareValue}
          </span>
        </span>
        <Badge label={status.label} tone={status.ready ? "lead" : "waiting"} even />
      </div>

      {/* V15 (847:79802): a 1.5px rule at 10% white with round caps, 249px of
          the body's 251 — not a 1px hairline. */}
      <div
        data-testid="rail-claim-rule"
        className="mx-px mt-6 h-[1.5px] rounded-full bg-white/10"
      />

      {/* T28 / T29 */}
      <dl className="mt-6 flex flex-col gap-1.5">
        {rows.map((row) => (
          <div
            key={row.label}
            data-testid="rail-claim-row"
            className="flex items-center justify-between gap-3 font-serif text-[12px] leading-[1.4] font-semibold tracking-[-0.12px]"
          >
            <dt className="min-w-0 truncate text-[#f4f4f4]/40">{row.label}</dt>
            <dd className="tnum shrink-0 text-[#f4f4f4]">{row.value}</dd>
          </div>
        ))}
      </dl>

      <PillButton
        label={cta.label}
        onPress={cta.onPress}
        disabled={cta.disabled}
        busy={cta.busy}
        tone="chrome"
        // 844:79756 is 229px from x=22, flush with the copy on the left and
        // 22px short of the body's right edge.
        place="mt-9 mr-[22px]"
        // 844:79758: this label is drawn at 10.459px, tracked -0.1046px — a
        // touch smaller than the share button's 11px.
        labelClass="text-[10.459px] tracking-[-0.1046px]"
      />
    </Frame>
  );
}

/**
 * The dots at the foot of the card (916:84230): three 10px dots on a 15.714px
 * pitch (a 5.714px gap), the current one solid white and the others at 45%.
 *
 * Each is a real button with a 44px-tall target — the dot itself is only 10px,
 * which no thumb can hit — and the active one carries aria-current so a screen
 * reader knows where it is. The target cannot also be 44px wide: dots drawn on
 * a 15.714px pitch leave each one 15.714px of its own, and overlapping wider
 * targets would send a press to the wrong dot. One card means nothing to page
 * between, so the pager draws nothing at all.
 */
export function RailPager({ count, index, onSelect, itemLabel }: RailPagerProps): JSX.Element {
  return (
    <div data-testid="rail-pager" className="flex items-center justify-center">
      {(count < 2 ? [] : Array.from({ length: count }, (_unused, i) => i)).map((i) => {
        const active = i === index;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={itemLabel(i, count)}
            aria-current={active ? "true" : undefined}
            className="grid h-11 w-[15.714px] cursor-pointer place-items-center rounded-full"
          >
            <span
              aria-hidden
              className={`size-2.5 rounded-full transition-colors ${active ? "bg-white" : "bg-white/45"}`}
            />
          </button>
        );
      })}
    </div>
  );
}
