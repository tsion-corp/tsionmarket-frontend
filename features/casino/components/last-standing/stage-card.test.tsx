import { createRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  isUrgent,
  StageCard,
  URGENT_SECONDS,
  type StageCardProps,
  type StageLeader,
} from "@/features/casino/components/last-standing/stage-card";

// jsdom under this Node build ships no matchMedia, and the card reads
// prefers-reduced-motion through it on mount. Every test declares the
// preference it wants rather than leaning on a default, so the reduced-motion
// case is a real assertion and not an accident of the environment.
function setReducedMotion(reduced: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduced : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const someoneElse: StageLeader = {
  label: "Currently leading",
  value: "0x36g3gt…993",
  isYou: false,
  avatarUrl: null,
  seed: "0x36g3gt993",
};

const you: StageLeader = {
  label: "You are currently leading",
  value: "You - 0x36g3gt…993",
  isYou: true,
  avatarUrl: null,
  seed: "0xmine",
};

function renderCard(props: Partial<StageCardProps> = {}) {
  const base: StageCardProps = {
    phase: "live",
    roundLabel: "Rounds #59",
    caption: "Each confirmed play resets the timer.",
    leader: someoneElse,
    countdown: "00:24",
    progress: 0.5,
  };
  return render(<StageCard {...base} {...props} />);
}

describe("StageCard", () => {
  beforeEach(() => {
    setReducedMotion(false);
  });

  describe("phases", () => {
    it("draws the not-started placeholder, caption and play glyph", () => {
      renderCard({
        phase: "notStarted",
        countdown: undefined,
        progress: undefined,
        caption: "The first confirmed play starts the round.",
      });

      expect(screen.getByText("Rounds #59")).toBeInTheDocument();
      // The design's own placeholder, read off the not-started stage frame
      // (929:1766) rather than invented here.
      expect(screen.getByTestId("stage-countdown")).toHaveTextContent("-- : --");
      expect(screen.getByText("The first confirmed play starts the round.")).toBeInTheDocument();
      expect(screen.getByTestId("stage-glyph")).toHaveAttribute(
        "src",
        "/casino/last-standing/glyph-play.png"
      );
      // No round is running, so the ring shows its track alone.
      expect(screen.queryByTestId("stage-ring-arc")).toBeNull();
    });

    it("draws the live countdown, caption and hourglass glyph", () => {
      renderCard();

      expect(screen.getByTestId("stage-countdown")).toHaveTextContent("00:24");
      expect(screen.getByText("Each confirmed play resets the timer.")).toBeInTheDocument();
      expect(screen.getByTestId("stage-glyph")).toHaveAttribute(
        "src",
        "/casino/last-standing/glyph-hourglass.png"
      );
      expect(screen.getByTestId("stage-ring-arc")).toBeInTheDocument();
    });

    it("draws the ended heading, sub line and checkered flag", () => {
      renderCard({
        phase: "ended",
        countdown: undefined,
        progress: undefined,
        heading: "This Round Has Ended.",
        subheading: "0x36g3gt…993 was the last player",
        caption: "",
        leader: { ...someoneElse, label: "Round winner" },
      });

      expect(screen.getByRole("heading", { name: "This Round Has Ended." })).toBeInTheDocument();
      expect(screen.getByText("0x36g3gt…993 was the last player")).toBeInTheDocument();
      expect(screen.getByTestId("stage-glyph")).toHaveAttribute(
        "src",
        "/casino/last-standing/glyph-flag.png"
      );
      expect(screen.queryByTestId("stage-countdown")).toBeNull();
      expect(screen.queryByTestId("stage-ring-track")).toBeNull();
    });

    it("draws the won heading, sub line and crown glyph", () => {
      renderCard({
        phase: "won",
        countdown: undefined,
        progress: undefined,
        heading: "You Were The Last Man Standing",
        subheading: "The results is confirmed, your winnings are ready to claim.",
        caption: "",
        leader: { ...you, label: "Round winner" },
      });

      expect(
        screen.getByRole("heading", { name: "You Were The Last Man Standing" })
      ).toBeInTheDocument();
      expect(
        screen.getByText("The results is confirmed, your winnings are ready to claim.")
      ).toBeInTheDocument();
      expect(screen.getByTestId("stage-glyph")).toHaveAttribute(
        "src",
        "/casino/last-standing/glyph-crown.png"
      );
    });

    // 844:79686: the caption is white at 80%.
    it("draws the caption in white at 80%", () => {
      renderCard();

      expect(screen.getByTestId("stage-caption").className).toContain("text-white/80");
    });

    // 844:78886: heading and sub line are one group 12px apart; the Winning
    // sub line is 1.2 leading in a 268px box, Round Ended keeps 1.3.
    it("groups the heading and sub line 12px apart with the design's leading", () => {
      const view = renderCard({
        phase: "won",
        heading: "You Were The Last Man Standing",
        subheading: "The results is confirmed.",
        caption: "",
      });

      expect(screen.getByTestId("stage-headline").className).toContain("gap-3");
      const won = screen.getByTestId("stage-subheading").className;
      expect(won).toContain("leading-[1.2]");
      expect(won).toContain("w-[268px]");

      view.unmount();
      renderCard({
        phase: "ended",
        heading: "This Round Has Ended.",
        subheading: "0x36g3gt…993 was the last player",
        caption: "",
      });
      expect(screen.getByTestId("stage-subheading").className).toContain("leading-[1.3]");
    });

    it("omits the caption line when the phase has no caption to show", () => {
      renderCard({ phase: "ended", heading: "This Round Has Ended.", caption: "" });

      expect(screen.queryByTestId("stage-caption")).toBeNull();
    });
  });

  describe("leader strip", () => {
    it("renders the leader's label and value", () => {
      renderCard();

      const strip = screen.getByTestId("stage-leader");
      expect(strip).toHaveTextContent("Currently leading");
      expect(strip).toHaveTextContent("0x36g3gt…993");
    });

    it("marks the strip when the leader is you", () => {
      renderCard({ leader: you, chip: { label: "You", tone: "leading" } });

      expect(screen.getByTestId("stage-leader")).toHaveAttribute("data-you", "true");
      expect(screen.getByText("You are currently leading")).toBeInTheDocument();
    });

    it("marks the strip when the leader is someone else", () => {
      renderCard({ leader: someoneElse, chip: { label: "Leading", tone: "other" } });

      expect(screen.getByTestId("stage-leader")).toHaveAttribute("data-you", "false");
    });

    it("renders the badge with its label as text, not colour alone", () => {
      renderCard({ leader: you, chip: { label: "You", tone: "leading" } });

      const chip = screen.getByTestId("stage-chip");
      expect(chip).toHaveTextContent("You");
      expect(chip).toHaveAttribute("data-tone", "leading");
    });

    it("renders the winner badge with its own label", () => {
      renderCard({ chip: { label: "Winner", tone: "winner" } });

      const chip = screen.getByTestId("stage-chip");
      expect(chip).toHaveTextContent("Winner");
      expect(chip).toHaveAttribute("data-tone", "winner");
    });

    // B4. The design gives the viewer's own badge two different golds —
    // #FFD02C while leading the countdown (847:80392) and #F7A92F on the
    // winning stage (844:78881). Another player's badge is the dark outline
    // pill (916:84111), tested below.
    it("paints the leading badge in the countdown stage's gold", () => {
      renderCard({ chip: { label: "You", tone: "leading" } });

      const chip = screen.getByTestId("stage-chip");
      expect(chip.className).toContain("bg-[#ffd02c]");
      expect(chip.className).toContain("border-[#1b1b1c]");
      expect(chip.className).toContain("text-[#1b1b1c]");
    });

    it("paints the winner badge in the winning stage's gold", () => {
      renderCard({ chip: { label: "Winner", tone: "winner" } });

      const chip = screen.getByTestId("stage-chip");
      expect(chip.className).toContain("bg-[#f7a92f]");
      expect(chip.className).toContain("border-[#1b1b1c]");
      expect(chip.className).toContain("text-[#1b1b1c]");
    });

    // 916:84111: another player leading gets a #333 pill with a 1px white rim,
    // a #F4F4F4 label and the white outline crown exported from that node.
    it("paints another player's badge as the dark outline pill", () => {
      renderCard({ leader: someoneElse, chip: { label: "Leading", tone: "other" } });

      const chip = screen.getByTestId("stage-chip");
      expect(chip).toHaveTextContent("Leading");
      expect(chip).toHaveAttribute("data-tone", "other");
      expect(chip.className).toContain("bg-[#333]");
      expect(chip.className).toContain("border-white");
      expect(chip.className).toContain("text-[#f4f4f4]");
      expect(chip.className).not.toContain("bg-[#ffd02c]");
      const crown = chip.querySelector("img");
      expect(crown).toHaveAttribute("src", "/casino/last-standing/stage-chip-crown-outline.svg");
      expect(crown?.className).toContain("size-[17px]");
    });

    // The viewer's own badges share the near-black knockout crown.
    it("draws the same near-black crown on both gold badge tones", () => {
      const leadingView = renderCard({ chip: { label: "Leading", tone: "leading" } });
      const leading = screen.getByTestId("stage-chip").querySelector("img");
      expect(leading).toHaveAttribute("src", "/casino/last-standing/chip-crown-filled.svg");
      // B4: a 17x17 box, not the bare 14x15 glyph.
      expect(leading?.className).toContain("size-[17px]");

      leadingView.unmount();
      renderCard({ chip: { label: "Winner", tone: "winner" } });
      expect(screen.getByTestId("stage-chip").querySelector("img")).toHaveAttribute(
        "src",
        "/casino/last-standing/chip-crown-filled.svg"
      );
    });

    it("renders no chip when none is passed", () => {
      renderCard({
        phase: "notStarted",
        countdown: undefined,
        progress: undefined,
        leader: {
          label: "No leader yet",
          value: "The first confirmed play takes the lead.",
          isYou: false,
          avatarUrl: null,
          seed: "none",
        },
        chip: null,
      });

      expect(screen.getByText("No leader yet")).toBeInTheDocument();
      expect(screen.queryByTestId("stage-chip")).toBeNull();
    });

    // The strip and the activity table share one avatar, so a player without a
    // picture gets the same deterministic mark in both places rather than two
    // different fallbacks for one wallet.
    it("falls back to the shared avatar's deterministic mark with no image", () => {
      const { container } = renderCard();
      const avatar = screen.getByTestId("stage-avatar");

      expect(avatar.querySelector("img")).toBeNull();
      expect(avatar.textContent?.trim()).not.toBe("");

      const first = avatar.innerHTML;
      container.remove();
      renderCard();
      expect(screen.getByTestId("stage-avatar").innerHTML).toBe(first);
    });

    it("uses the leader's avatar image when one is given", () => {
      renderCard({ leader: { ...someoneElse, avatarUrl: "https://cdn.example/a.png" } });

      const image = screen.getByTestId("stage-avatar").querySelector("img");
      expect(image).toHaveAttribute("src", "https://cdn.example/a.png");
    });

    it("renders no strip at all when there is no leader", () => {
      renderCard({ leader: null });

      expect(screen.queryByTestId("stage-leader")).toBeNull();
    });
  });

  describe("stat tiles", () => {
    it("renders both tiles when both are passed", () => {
      renderCard({
        pot: { label: "Total Pot", value: "$20" },
        winnerShare: { label: "Winner's Share", value: "$10" },
      });

      const pot = screen.getByTestId("stage-pot");
      expect(pot).toHaveTextContent("Total Pot");
      expect(pot).toHaveTextContent("$20");

      const share = screen.getByTestId("stage-winner-share");
      expect(share).toHaveTextContent("Winner's Share");
      expect(share).toHaveTextContent("$10");
    });

    // 916:84639: the pot's icon is three distinct 14.375px bag exports,
    // painted front-left, back, front-right (the last carrying its own drop
    // shadow); the winner's share keeps its single 20px bag (916:84364).
    it("stacks three distinct money bags on the pot tile, in the design's order", () => {
      renderCard({
        pot: { label: "Total Pot", value: "$20" },
        winnerShare: { label: "Winner's Share", value: "$10" },
      });

      const bags = screen.getByTestId("stage-pot").querySelectorAll("img");
      expect(Array.from(bags).map((bag) => bag.getAttribute("src"))).toEqual([
        "/casino/last-standing/stage-pot-bag-front-left.svg",
        "/casino/last-standing/stage-pot-bag-back.svg",
        "/casino/last-standing/stage-pot-bag-front-right.svg",
      ]);
      const frames = screen.getAllByTestId("stage-pot-bag");
      expect(frames.map((f) => [f.style.left, f.style.top])).toEqual([
        ["0px", "5.625px"],
        ["3.125px", "0px"],
        ["6.875px", "5.625px"],
      ]);
      // Front-left is cropped inside its frame; front-right bleeds past it
      // for the shadow its export carries.
      expect((bags[0].parentElement as HTMLElement).style.inset).toBe("4.73% 10.79% 4.7% 10.78%");
      expect((bags[2].parentElement as HTMLElement).style.inset).toBe(
        "-20.58% -13.41% -43.69% -23.58%"
      );

      const share = screen.getByTestId("stage-winner-share").querySelectorAll("img");
      expect(share).toHaveLength(1);
      expect(share[0]).toHaveAttribute("width", "20");
    });

    // 916:84637 / 916:84725: one 1px solid #FFFFFF stroke on both tiles.
    it("gives both tiles the same rim", () => {
      renderCard({
        pot: { label: "Total Pot", value: "$20" },
        winnerShare: { label: "Winner's Share", value: "$10" },
      });

      const rim = "border-white";
      expect(screen.getByTestId("stage-pot").className).toContain(rim);
      expect(screen.getByTestId("stage-winner-share").className).toContain(rim);
    });

    it("renders only the tile it is given", () => {
      renderCard({ pot: { label: "Total Pot", value: "$20" } });

      expect(screen.getByTestId("stage-pot")).toBeInTheDocument();
      expect(screen.queryByTestId("stage-winner-share")).toBeNull();
    });

    // The Winning (844:78328) and Round Ended (918:85695) stages draw no
    // tiles, whatever the caller passes.
    it.each(["won", "ended"] as const)("draws no tiles on the %s stage", (phase) => {
      renderCard({
        phase,
        countdown: undefined,
        progress: undefined,
        heading: "Heading",
        caption: "",
        pot: { label: "Total Pot", value: "$20" },
        winnerShare: { label: "Winner's Share", value: "$10" },
      });

      expect(screen.queryByTestId("stage-tiles")).toBeNull();
      expect(screen.queryByTestId("stage-pot")).toBeNull();
    });

    it("keeps the tiles on the not-started stage", () => {
      renderCard({
        phase: "notStarted",
        countdown: undefined,
        progress: undefined,
        pot: { label: "Total Pot", value: "$20" },
      });

      expect(screen.getByTestId("stage-pot")).toBeInTheDocument();
    });

    it("renders no tiles when neither is passed", () => {
      renderCard();

      expect(screen.queryByTestId("stage-tiles")).toBeNull();
    });

    // The wager's coin flight lands on the pot, and the pot is drawn in here,
    // so the caller needs a handle on that tile to aim at.
    it("hands the caller a ref to the pot tile", () => {
      const potRef = createRef<HTMLDivElement>();
      renderCard({ pot: { label: "Total Pot", value: "$20" }, potRef });

      expect(potRef.current).toBe(screen.getByTestId("stage-pot"));
    });

    it("ignores a pot ref when there is no pot tile to hold", () => {
      const potRef = createRef<HTMLDivElement>();
      renderCard({ potRef });

      expect(potRef.current).toBeNull();
    });
  });

  describe("countdown ring", () => {
    it("drives the arc's dash offset from progress", () => {
      renderCard({ progress: 0.5 });

      const arc = screen.getByTestId("stage-ring-arc");
      const circumference = Number(arc.getAttribute("data-circumference"));
      expect(circumference).toBeGreaterThan(0);
      expect(Number(arc.getAttribute("data-offset"))).toBeCloseTo(circumference * 0.5, 3);
    });

    it("clamps progress outside 0..1 rather than drawing past the ring", () => {
      renderCard({ progress: 1.8 });

      const arc = screen.getByTestId("stage-ring-arc");
      expect(Number(arc.getAttribute("data-offset"))).toBeCloseTo(0, 3);
    });

    it("draws a full ring when progress is missing on a live round", () => {
      renderCard({ progress: undefined });

      const arc = screen.getByTestId("stage-ring-arc");
      const circumference = Number(arc.getAttribute("data-circumference"));
      expect(Number(arc.getAttribute("data-offset"))).toBeCloseTo(0, 3);
      expect(circumference).toBeGreaterThan(0);
    });

    it("announces the clock politely rather than on every tick", () => {
      renderCard();

      expect(screen.getByTestId("stage-countdown")).toHaveAttribute("aria-live", "off");
    });
  });

  // The team's ask: the depleting gold turns red once ten seconds or fewer
  // remain. Figma has no urgent arc, so the red is the design's own badge red
  // (916:84150, #FF745B).
  describe("urgent arc", () => {
    const gold = "#D4B32D";
    const red = "#FF745B";

    it("puts the threshold at ten seconds", () => {
      expect(URGENT_SECONDS).toBe(10);
    });

    it("keeps the arc gold above ten seconds", () => {
      renderCard({ secondsLeft: 11 });

      const arc = screen.getByTestId("stage-ring-arc");
      expect(arc).toHaveAttribute("data-urgent", "false");
      expect(arc).toHaveAttribute("data-stroke", gold);
    });

    it("turns the arc red at exactly ten seconds", () => {
      renderCard({ secondsLeft: 10 });

      const arc = screen.getByTestId("stage-ring-arc");
      expect(arc).toHaveAttribute("data-urgent", "true");
      expect(arc).toHaveAttribute("data-stroke", red);
    });

    it("keeps the arc red below ten seconds", () => {
      renderCard({ secondsLeft: 1, progress: 0.05 });

      expect(screen.getByTestId("stage-ring-arc")).toHaveAttribute("data-stroke", red);
    });

    it("is not red once the clock has run out", () => {
      renderCard({ secondsLeft: 0, progress: 0 });

      expect(screen.getByTestId("stage-ring-arc")).toHaveAttribute("data-stroke", gold);
    });

    it("stays gold when the caller does not say how long is left", () => {
      renderCard({ secondsLeft: undefined });

      expect(screen.getByTestId("stage-ring-arc")).toHaveAttribute("data-stroke", gold);
    });

    it("draws no arc at all once the round has ended", () => {
      renderCard({ phase: "ended", secondsLeft: 5, heading: "This Round Has Ended." });

      expect(screen.queryByTestId("stage-ring-arc")).toBeNull();
    });

    it("draws the red directly when the viewer asked for reduced motion", () => {
      setReducedMotion(true);
      renderCard({ secondsLeft: 10 });

      const arc = screen.getByTestId("stage-ring-arc");
      expect(arc).toHaveAttribute("data-animated", "false");
      expect(arc).toHaveAttribute("stroke", red);
    });

    it("leaves the digits and their silent live region alone", () => {
      renderCard({ secondsLeft: 5, countdown: "00:05" });

      const clock = screen.getByTestId("stage-countdown");
      expect(clock).toHaveTextContent("00:05");
      expect(clock).toHaveAttribute("aria-live", "off");
    });

    it.each([
      [11, false],
      [10.4, false],
      [10, true],
      [0.5, true],
      [0, false],
      [-1, false],
      [Number.NaN, false],
    ])("isUrgent(%s) is %s", (seconds, expected) => {
      expect(isUrgent(seconds)).toBe(expected);
    });
  });

  describe("frozen", () => {
    it("dims the clock and the ring when the connection is lost", () => {
      renderCard({ frozen: true });

      expect(screen.getByTestId("stage-clock")).toHaveAttribute("data-frozen", "true");
    });

    it("leaves the clock undimmed and adds nothing else while connected", () => {
      renderCard({ frozen: false });

      expect(screen.getByTestId("stage-clock")).toHaveAttribute("data-frozen", "false");
      expect(screen.queryByText(/connection/iu)).toBeNull();
    });
  });

  describe("reduced motion", () => {
    it("sweeps the arc when motion is allowed", () => {
      setReducedMotion(false);
      renderCard();

      expect(screen.getByTestId("stage-ring-arc")).toHaveAttribute("data-animated", "true");
    });

    it("draws a static arc when the viewer asked for reduced motion", () => {
      setReducedMotion(true);
      renderCard();

      const arc = screen.getByTestId("stage-ring-arc");
      expect(arc).toHaveAttribute("data-animated", "false");
      // The arc still reads correctly — only the sweep is dropped.
      const circumference = Number(arc.getAttribute("data-circumference"));
      expect(Number(arc.getAttribute("data-offset"))).toBeCloseTo(circumference * 0.5, 3);
    });
  });

  describe("overlay slot", () => {
    it("renders the children the lead hands it over the stage", () => {
      renderCard({ children: <p>Claim your winnings</p> });

      expect(screen.getByText("Claim your winnings")).toBeInTheDocument();
    });
  });

  // The design leaves the card's top-right corner empty, which is where the
  // sound switch went when it left the page header. It mirrors the round label
  // opposite it: the label sits at left 29 / top 22 (the card's 12px padding
  // plus its own 17/10), so the control takes the same top and the same inset
  // from the right.
  describe("corner slot", () => {
    it("draws the corner control opposite the round label", () => {
      renderCard({ cornerAction: <button type="button">Sound</button> });

      const slot = screen.getByRole("button", { name: "Sound" }).parentElement as HTMLElement;
      expect(slot.className).toContain("absolute");
      expect(slot.className).toContain("top-[22px]");
      expect(slot.className).toContain("right-[29px]");
      // Above the backdrop and the glow, both of which are painted first.
      expect(slot.className).toContain("z-10");
    });

    it("draws nothing in the corner when no control is given", () => {
      renderCard();

      expect(screen.queryByRole("button")).toBeNull();
    });

    // Out of flow on purpose: the control is 34px tall against the label's 16px
    // line, so sharing that row would push the ring and everything under it
    // down. The cost is that it overlaps the tiles' drawn 25px offset, so the
    // tiles start below it instead — 22 + its 34px box + a 14px gap.
    it("moves the tiles clear of the corner control, and leaves them put without one", () => {
      const tiles = {
        pot: { label: "Total Pot", value: "$20" },
        winnerShare: { label: "Winner's Share", value: "$10" },
      };

      renderCard(tiles);
      expect(screen.getByTestId("stage-tiles").className).toContain("@[672px]:top-[25px]");

      cleanup();

      renderCard({ ...tiles, cornerAction: <button type="button">Sound</button> });
      const shifted = screen.getByTestId("stage-tiles");
      expect(shifted.className).toContain("@[672px]:top-[70px]");
      expect(shifted.className).not.toContain("@[672px]:top-[25px]");
    });
  });

  // The tiles used to float from 560px up, where they landed on the countdown.
  // The threshold is arithmetic, not taste: the clock is centred, so its right
  // edge is at W/2 + 111, and the tiles' left edge is at W - 209 (184 wide, 25
  // from the right). They overlap while W/2 + 111 > W - 209, i.e. below 640.
  //
  // jsdom computes no layout, so this asserts the breakpoint rather than
  // measuring a collision — but it recomputes the threshold from the numbers
  // in the class names, so a later change to the tile width or the inset makes
  // it fail instead of silently reopening the overlap.
  describe("tiles clear the countdown at every width", () => {
    it("floats the tiles only above the width at which they stop hitting the clock", () => {
      renderCard({
        pot: { label: "Total Pot", value: "$20" },
        winnerShare: { label: "Winner's Share", value: "$10" },
      });

      const cls = screen.getByTestId("stage-tiles").className;

      // Every floating utility has to share one breakpoint, or the tiles go
      // absolute at one width and get their width at another.
      const breakpoints = new Set(Array.from(cls.matchAll(/@\[(\d+)px\]:/gu), (m) => Number(m[1])));
      expect(breakpoints.size).toBe(1);
      const floatsAt = [...breakpoints][0];

      const width = Number(/@\[\d+px\]:w-\[(\d+)px\]/u.exec(cls)?.[1]);
      const inset = Number(/@\[\d+px\]:right-\[(\d+)px\]/u.exec(cls)?.[1]);
      expect(width).toBe(184);
      expect(inset).toBe(25);

      // Clock half-width, from the card's own `@[560px]:w-[222px]` ring.
      const clockHalf = 222 / 2;
      // W/2 + clockHalf <= W - (width + inset)  =>  W >= 2 * (clockHalf + width + inset)
      const clears = 2 * (clockHalf + width + inset);
      expect(clears).toBe(640);
      expect(floatsAt).toBeGreaterThanOrEqual(clears);
    });
  });
});

describe("hero block placement", () => {
  // Measured, not chosen. On the Winner stage (918:87239) the hero group
  // 918:88455 sits at y=33 in the 372px card and is 252 tall, and the leader
  // strip 918:88445 starts at 301 — so the design leaves 33 above the group
  // and 87 below it. Centring puts 60 either side, which drags the sub-line
  // down towards the strip and is what the maintainer saw as cramped.
  function column(container: HTMLElement): HTMLElement {
    const el = container.querySelector<HTMLElement>("[data-testid='stage-card'] > div.flex-1");
    if (!el) throw new Error("the centre column should be a flex-1 child of the card");
    return el;
  }

  it("sits the won hero high in the card rather than centring it", () => {
    const { container } = renderCard({
      phase: "won",
      heading: "You were the last man standing",
      subheading: "The result is confirmed, your winnings are ready to claim.",
      countdown: undefined,
      caption: undefined,
    });
    const el = column(container);
    expect(el).toHaveClass("justify-start");
    expect(el).toHaveClass("pt-[21px]");
    expect(el).not.toHaveClass("justify-center");
  });

  it("keeps the clock phases centred", () => {
    const { container } = renderCard({ phase: "live" });
    const el = column(container);
    expect(el).toHaveClass("justify-center");
    expect(el).not.toHaveClass("justify-start");
  });

  it("keeps the drawn 12px between the heading and its sub line", () => {
    // 844:78886 / 918:86254 draw the two as one group 12px apart, under a
    // 16px gap from the glyph. Both were already right; pinned so a later
    // spacing pass cannot quietly even them out.
    renderCard({
      phase: "won",
      heading: "You were the last man standing",
      subheading: "The result is confirmed, your winnings are ready to claim.",
      countdown: undefined,
      caption: undefined,
    });
    expect(screen.getByTestId("stage-headline")).toHaveClass("gap-3");
  });
});
