import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  RailActionCard,
  RailClaimCard,
  RailInviteCard,
  RailCardFrame,
  RailPager,
  type RailActionCardProps,
  type RailClaimCardProps,
  type RailInviteCardProps,
} from "@/features/casino/components/last-standing/rail-cards";

// The rail cards are pure presentation: every string, every handler and the QR
// node itself arrive as props. These tests therefore never mock anything — they
// hand the card props and read the DOM back.

function actionProps(over: Partial<RailActionCardProps> = {}): RailActionCardProps {
  return {
    badge: { label: "Waiting for the first play", tone: "waiting" },
    heading: "Start The Round",
    sub: "Be the last man and win the winner's share.",
    amountLabel: "Play Amount",
    stepper: {
      amount: "$0.38",
      currency: "USD",
      onDecrement: vi.fn(),
      onIncrement: vi.fn(),
      canDecrement: true,
      canIncrement: true,
    },
    cta: { label: "Start Game", icon: "play", onPress: vi.fn() },
    ...over,
  };
}

function inviteProps(over: Partial<RailInviteCardProps> = {}): RailInviteCardProps {
  return {
    chip: "You earn 10%",
    heading: "Invite players",
    sub: "Every player who joins grows the pot, and you take 10% of it when the timer ends.",
    qr: <i data-testid="qr" />,
    caption: "Scan to join game.",
    share: { label: "Share", onPress: vi.fn() },
    ...over,
  };
}

function claimProps(over: Partial<RailClaimCardProps> = {}): RailClaimCardProps {
  return {
    heading: "Claim Your Winnings",
    shareLabel: "Winner's Share",
    shareValue: "$0.58",
    status: { label: "Ready to claim", ready: true },
    rows: [
      { label: "Final pot", value: "$1.16" },
      { label: "Winner Allocation", value: "$0.58" },
      { label: "Claim Status", value: "Not Claimed" },
    ],
    cta: { label: "Claim $0.58", onPress: vi.fn() },
    ...over,
  };
}

describe("RailActionCard", () => {
  it("prints the badge, heading, sub, amount label and stake", () => {
    render(<RailActionCard {...actionProps()} />);

    expect(screen.getByText("Waiting for the first play")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Start The Round" })).toBeTruthy();
    expect(screen.getByText("Be the last man and win the winner's share.")).toBeTruthy();
    expect(screen.getByText("Play Amount")).toBeTruthy();
    expect(screen.getByText("$0.38")).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
  });

  it("omits the badge when there is none", () => {
    render(<RailActionCard {...actionProps({ badge: null })} />);
    expect(screen.queryByTestId("rail-badge")).toBeNull();
  });

  // The three tones are the whole story the badge tells: you are winning,
  // someone else is, or nobody has played yet. Each gets its own colour, so a
  // glance is enough.
  it("colours the lead badge amber", () => {
    render(
      <RailActionCard {...actionProps({ badge: { label: "You are in the lead", tone: "lead" } })} />
    );
    const badge = screen.getByTestId("rail-badge");
    expect(badge.dataset.tone).toBe("lead");
    expect(badge.className).toContain("#ffe178");
  });

  it("colours the behind badge red", () => {
    render(
      <RailActionCard
        {...actionProps({ badge: { label: "Another player is leading", tone: "behind" } })}
      />
    );
    const badge = screen.getByTestId("rail-badge");
    expect(badge.dataset.tone).toBe("behind");
    // The design's own red, not the palette's --color-down (#f6a5a5).
    expect(badge.className).toContain("#ff745b");
    expect(badge.className).not.toContain("text-down");
  });

  it("colours the waiting badge grey", () => {
    render(<RailActionCard {...actionProps()} />);
    const badge = screen.getByTestId("rail-badge");
    expect(badge.dataset.tone).toBe("waiting");
    expect(badge.className).toContain("text-white/65");
    expect(badge.className).not.toContain("text-down");
  });

  it("steps the stake up and down", () => {
    const props = actionProps();
    render(<RailActionCard {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Increase Play Amount" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease Play Amount" }));

    expect(props.stepper.onIncrement).toHaveBeenCalledTimes(1);
    expect(props.stepper.onDecrement).toHaveBeenCalledTimes(1);
  });

  it("takes bespoke stepper labels when the caller localises them", () => {
    const props = actionProps();
    render(
      <RailActionCard
        {...actionProps({
          stepper: { ...props.stepper, decrementLabel: "Moins", incrementLabel: "Plus" },
        })}
      />
    );

    expect(screen.getByRole("button", { name: "Moins" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Plus" })).toBeTruthy();
  });

  // At the bottom of the range the minus must be dead, not merely quiet: a
  // click that still fired would walk the stake below the floor.
  it("kills the minus at the floor", () => {
    const props = actionProps();
    render(
      <RailActionCard {...actionProps({ stepper: { ...props.stepper, canDecrement: false } })} />
    );

    const minus = screen.getByRole("button", { name: "Decrease Play Amount" });
    expect((minus as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(minus);
    expect(props.stepper.onDecrement).not.toHaveBeenCalled();
  });

  it("kills the plus at the ceiling", () => {
    const props = actionProps();
    render(
      <RailActionCard {...actionProps({ stepper: { ...props.stepper, canIncrement: false } })} />
    );

    const plus = screen.getByRole("button", { name: "Increase Play Amount" });
    expect((plus as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(plus);
    expect(props.stepper.onIncrement).not.toHaveBeenCalled();
  });

  it("kills both steps while the stepper is disabled", () => {
    const props = actionProps();
    render(<RailActionCard {...actionProps({ stepper: { ...props.stepper, disabled: true } })} />);

    const minus = screen.getByRole("button", { name: "Decrease Play Amount" });
    const plus = screen.getByRole("button", { name: "Increase Play Amount" });
    expect((minus as HTMLButtonElement).disabled).toBe(true);
    expect((plus as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(minus);
    fireEvent.click(plus);
    expect(props.stepper.onDecrement).not.toHaveBeenCalled();
    expect(props.stepper.onIncrement).not.toHaveBeenCalled();
  });

  it("fires the call to action and draws its play icon", () => {
    const props = actionProps();
    render(<RailActionCard {...props} />);

    const cta = screen.getByRole("button", { name: /Start Game/u });
    expect(cta.querySelector("img")?.getAttribute("src")).toBe(
      "/casino/last-standing/rail-play.svg"
    );
    fireEvent.click(cta);
    expect(props.cta.onPress).toHaveBeenCalledTimes(1);
  });

  it("drops the icon when the call to action has none", () => {
    render(
      <RailActionCard
        {...actionProps({ cta: { label: "Add to position", icon: null, onPress: vi.fn() } })}
      />
    );
    const cta = screen.getByRole("button", { name: "Add to position" });
    expect(cta.querySelector("img, svg")).toBeNull();
  });

  it("spins and locks the call to action while busy", () => {
    const props = actionProps();
    render(<RailActionCard {...actionProps({ cta: { ...props.cta, busy: true } })} />);

    const cta = screen.getByRole("button", { name: /Start Game/u });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    expect(cta.querySelector(".animate-spin")).toBeTruthy();
    fireEvent.click(cta);
    expect(props.cta.onPress).not.toHaveBeenCalled();
  });

  it("locks a disabled call to action without spinning", () => {
    const props = actionProps();
    render(<RailActionCard {...actionProps({ cta: { ...props.cta, disabled: true } })} />);

    const cta = screen.getByRole("button", { name: /Start Game/u });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    expect(cta.querySelector(".animate-spin")).toBeNull();
    fireEvent.click(cta);
    expect(props.cta.onPress).not.toHaveBeenCalled();
  });
});

describe("RailInviteCard", () => {
  it("prints the heading, chip, sub and caption around the supplied code", () => {
    render(<RailInviteCard {...inviteProps()} />);

    expect(screen.getByRole("heading", { name: "Invite players" })).toBeTruthy();
    expect(screen.getByText("You earn 10%")).toBeTruthy();
    expect(
      screen.getByText(
        "Every player who joins grows the pot, and you take 10% of it when the timer ends."
      )
    ).toBeTruthy();
    expect(screen.getByText("Scan to join game.")).toBeTruthy();
  });

  // The card never generates a code. Whatever node the rail hands it is what
  // sits in the white tile.
  it("mounts the caller's code inside the tile", () => {
    render(<RailInviteCard {...inviteProps()} />);
    const tile = screen.getByTestId("rail-qr");
    expect(within(tile).getByTestId("qr")).toBeTruthy();
    expect(tile.className).toContain("bg-white");
  });

  it("shares on press", () => {
    const props = inviteProps();
    render(<RailInviteCard {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /Share/u }));
    expect(props.share.onPress).toHaveBeenCalledTimes(1);
  });

  it("omits the chip when there is none", () => {
    render(<RailInviteCard {...inviteProps({ chip: null })} />);
    expect(screen.queryByTestId("rail-chip")).toBeNull();
  });
});

describe("RailClaimCard", () => {
  it("prints the heading, winner's share and every detail row", () => {
    render(<RailClaimCard {...claimProps()} />);

    expect(screen.getByRole("heading", { name: "Claim Your Winnings" })).toBeTruthy();
    expect(screen.getByText("Winner's Share")).toBeTruthy();
    expect(screen.getByText("Final pot")).toBeTruthy();
    expect(screen.getByText("$1.16")).toBeTruthy();
    expect(screen.getByText("Winner Allocation")).toBeTruthy();
    expect(screen.getByText("Claim Status")).toBeTruthy();
    expect(screen.getByText("Not Claimed")).toBeTruthy();
    // The winner's share and the allocation row carry the same figure, so it
    // appears twice — once big, once in the breakdown.
    expect(screen.getAllByText("$0.58")).toHaveLength(2);
  });

  it("renders exactly the rows it is given", () => {
    render(<RailClaimCard {...claimProps({ rows: [{ label: "Final pot", value: "$9.00" }] })} />);
    expect(screen.getAllByTestId("rail-claim-row")).toHaveLength(1);
  });

  it("flags a claimable payout in amber", () => {
    render(<RailClaimCard {...claimProps()} />);
    const badge = screen.getByTestId("rail-badge");
    expect(screen.getByText("Ready to claim")).toBeTruthy();
    expect(badge.dataset.tone).toBe("lead");
    expect(badge.className).toContain("#ffe178");
  });

  it("greys the status out when nothing is claimable yet", () => {
    render(<RailClaimCard {...claimProps({ status: { label: "Settling", ready: false } })} />);
    const badge = screen.getByTestId("rail-badge");
    expect(badge.dataset.tone).toBe("waiting");
    expect(badge.className).not.toContain("#ffe178");
  });

  it("claims on press", () => {
    const props = claimProps();
    render(<RailClaimCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Claim \$0\.58/u }));
    expect(props.cta.onPress).toHaveBeenCalledTimes(1);
  });

  it("spins and locks the claim while busy", () => {
    const props = claimProps();
    render(<RailClaimCard {...claimProps({ cta: { ...props.cta, busy: true } })} />);

    const cta = screen.getByRole("button", { name: /Claim \$0\.58/u });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    expect(cta.querySelector(".animate-spin")).toBeTruthy();
    fireEvent.click(cta);
    expect(props.cta.onPress).not.toHaveBeenCalled();
  });

  it("locks a disabled claim", () => {
    const props = claimProps();
    render(<RailClaimCard {...claimProps({ cta: { ...props.cta, disabled: true } })} />);

    const cta = screen.getByRole("button", { name: /Claim \$0\.58/u });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(cta);
    expect(props.cta.onPress).not.toHaveBeenCalled();
  });
});

describe("RailPager", () => {
  it("names every dot for a screen reader", () => {
    render(
      <RailPager
        count={3}
        index={1}
        onSelect={vi.fn()}
        itemLabel={(i, count) => `Go to card ${i + 1} of ${count}`}
      />
    );

    expect(screen.getByRole("button", { name: "Go to card 1 of 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go to card 2 of 3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go to card 3 of 3" })).toBeTruthy();
  });

  it("marks only the active dot as current", () => {
    render(
      <RailPager
        count={3}
        index={1}
        onSelect={vi.fn()}
        itemLabel={(i, count) => `Go to card ${i + 1} of ${count}`}
      />
    );

    expect(
      screen.getByRole("button", { name: "Go to card 2 of 3" }).getAttribute("aria-current")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Go to card 1 of 3" }).getAttribute("aria-current")
    ).toBeNull();
  });

  it("selects the dot that was pressed", () => {
    const onSelect = vi.fn();
    render(
      <RailPager
        count={3}
        index={0}
        onSelect={onSelect}
        itemLabel={(i, count) => `Go to card ${i + 1} of ${count}`}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Go to card 3 of 3" }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  // A thumb needs 44px even though the dot itself is 10px across, so the
  // target is the button and the dot is only what you see.
  it("keeps a thumb-tall target under each dot", () => {
    render(
      <RailPager
        count={2}
        index={0}
        onSelect={vi.fn()}
        itemLabel={(i, count) => `Go to card ${i + 1} of ${count}`}
      />
    );
    const dot = screen.getByRole("button", { name: "Go to card 1 of 2" });
    expect(dot.className).toContain("h-11");
  });

  // 916:84230: 10px dots on a 15.714px pitch, white for the current card and
  // 45% white for the rest.
  it("draws the design's dots", () => {
    render(
      <RailPager
        count={3}
        index={2}
        onSelect={vi.fn()}
        itemLabel={(i, count) => `Go to card ${i + 1} of ${count}`}
      />
    );
    const buttons = screen.getAllByRole("button");
    for (const button of buttons) expect(button.className).toContain("w-[15.714px]");
    const dots = buttons.map((b) => b.querySelector("span[aria-hidden]")?.className ?? "");
    expect(dots.every((d) => d.includes("size-2.5"))).toBe(true);
    expect(dots[0]).toContain("bg-white/45");
    expect(dots[1]).toContain("bg-white/45");
    expect(dots[2]).toMatch(/bg-white(?!\/)/u);
  });

  it("draws nothing for a single card", () => {
    const { container } = render(
      <RailPager
        count={1}
        index={0}
        onSelect={vi.fn()}
        itemLabel={(i, count) => `Go to card ${i + 1} of ${count}`}
      />
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});

// The wager's coin flight launches from this button's viewport box, and the
// button is drawn in here rather than by the rail that owns the animation.
describe("RailActionCard cta handle", () => {
  it("hands the caller the action button itself", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<RailActionCard {...actionProps()} ctaRef={ref} />);

    expect(ref.current).toBe(screen.getByRole("button", { name: "Start Game" }));
  });

  it("stands without one", () => {
    render(<RailActionCard {...actionProps()} />);
    expect(screen.getByRole("button", { name: "Start Game" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The design, read back off the DOM.
//
// These are not style preferences: each one is a value the Figma file states
// and a shipped build got wrong, so each is pinned where it can only be broken
// deliberately. Class-name assertions are the only handle a jsdom render has on
// a Tailwind utility — no stylesheet runs here — so they read the emitted token
// rather than a computed colour.
// ---------------------------------------------------------------------------

describe("the chrome pill actually gets a background", () => {
  // The bug: `${PILL_BUTTON}${tone === "chrome" ? "ws-chrome-pill" : ""}` with
  // no separator welded the utility onto the last class of PILL_BUTTON, so the
  // browser saw one nonsense token and dropped BOTH. The pill kept text-ink
  // (#0a0a0a) with nothing behind it: a near-black label on a transparent pill
  // over a #121314 card. Invisible. classList is what the browser parses, so
  // that is what this reads — a substring match on className would have passed
  // happily while the pill was blank.
  it("emits ws-chrome-pill as its own token on the share button", () => {
    render(<RailInviteCard {...inviteProps()} />);
    const share = screen.getByRole("button", { name: /Share/u });
    expect(share.classList.contains("ws-chrome-pill")).toBe(true);
  });

  it("emits ws-chrome-pill as its own token on the claim button", () => {
    render(<RailClaimCard {...claimProps()} />);
    const claim = screen.getByRole("button", { name: /Claim \$0\.58/u });
    expect(claim.classList.contains("ws-chrome-pill")).toBe(true);
  });

  it("keeps every class PILL_BUTTON ends with", () => {
    render(<RailInviteCard {...inviteProps()} />);
    const share = screen.getByRole("button", { name: /Share/u });
    // The token PILL_BUTTON ends on, which the missing space ate along with it.
    expect(share.classList.contains("min-[980px]:min-h-[31.798px]")).toBe(true);
    expect([...share.classList].some((token) => token.includes("]ws-chrome-pill"))).toBe(false);
  });

  // The utility in globals.css draws the Market balance card as well, at double
  // the shadow the Last Man is drawn with, so this card carries its own copy of
  // the design's numbers: angle 179.583deg, a 0.619px inset highlight and a
  // 1.238/2.477px drop shadow — the same shadows as the amber pill.
  it("paints the design's own gradient and shadows", () => {
    render(<RailInviteCard {...inviteProps()} />);
    const share = screen.getByRole("button", { name: /Share/u });
    expect(share.style.backgroundImage).toContain("179.583deg");
    expect(share.style.boxShadow).toContain("0.619px");
    expect(share.style.boxShadow).toContain("2.477px");
    // B2's label tracks where B1's does not.
    expect(share.classList.contains("tracking-[-0.11px]")).toBe(true);
  });

  it("paints the amber pill with the same shadows", () => {
    render(<RailActionCard {...actionProps()} />);
    const cta = screen.getByRole("button", { name: /Start Game/u });
    expect(cta.style.backgroundImage).toContain("179.583deg");
    expect(cta.style.boxShadow).toContain("0.619px");
    expect(cta.style.boxShadow).toContain("2.477px");
  });
});

describe("rail card surface", () => {
  // Spec §4: every rail card is a flat #121314 panel at radius 15px with no
  // border — the same surface the stage card beside it uses. ws-card is the
  // shell's translucent white glass with a hairline and a lit top edge, which
  // is a different component from a different screen.
  it.each([
    ["action", <RailActionCard {...actionProps()} key="a" />],
    ["invite", <RailInviteCard {...inviteProps()} key="i" />],
    ["claim", <RailClaimCard {...claimProps()} key="c" />],
  ])("seats the %s card on #121314 at 15px with no glass", (name, element) => {
    const { container } = render(element);
    const card = container.querySelector(`[data-rail-card="${name}"]`);
    expect(card).not.toBeNull();
    expect(card?.className).toContain("bg-[#121314]");
    expect(card?.className).toContain("rounded-[15px]");
    expect(card?.className).not.toContain("ws-card");
    expect(card?.className).not.toContain("rounded-[20px]");
  });
});

describe("icon sides", () => {
  // B1 leads with its play glyph, B2 trails its share glyph. Two buttons that
  // are otherwise the same pill, and the design draws them differently.
  it("trails the share glyph after its label", () => {
    render(<RailInviteCard {...inviteProps()} />);
    const nodes = [...screen.getByRole("button", { name: /Share/u }).childNodes];
    expect(nodes[nodes.length - 1]?.nodeName).toBe("IMG");
  });

  it("leads with the play glyph before its label", () => {
    render(<RailActionCard {...actionProps()} />);
    const nodes = [...screen.getByRole("button", { name: /Start Game/u }).childNodes];
    expect(nodes[0]?.nodeName).toBe("IMG");
  });

  it("draws the share glyph in the design's 12px box", () => {
    render(<RailInviteCard {...inviteProps()} />);
    const glyph = screen.getByRole("button", { name: /Share/u }).querySelector("img");
    expect(glyph?.getAttribute("src")).toBe("/casino/last-standing/rail-share.svg");
    expect(glyph?.getAttribute("width")).toBe("12");
    expect(glyph?.getAttribute("height")).toBe("12");
    expect(glyph?.className).toContain("size-3");
  });
});

describe("stake stepper", () => {
  // B3: a 40px box, no fill, and the design's own remove-circle / add-circle
  // artwork (ring included), 36px clear of the figure on each side.
  it("draws both steps as the design's 40px circle glyphs", () => {
    render(<RailActionCard {...actionProps()} />);
    for (const [name, file] of [
      ["Decrease Play Amount", "rail-minus.svg"],
      ["Increase Play Amount", "rail-plus.svg"],
    ] as const) {
      const step = screen.getByRole("button", { name });
      expect(step.className).toContain("size-10");
      expect(step.className).not.toContain("bg-surface");
      expect(step.className).not.toMatch(/\bborder\b/u);
      expect(step.querySelector("img")?.getAttribute("src")).toBe(`/casino/last-standing/${file}`);
      expect(step.querySelector("svg")).toBeNull();
    }
  });

  it("holds the figure 36px clear of each step", () => {
    render(<RailActionCard {...actionProps()} />);
    const row = screen.getByRole("button", { name: "Decrease Play Amount" }).parentElement;
    expect(row?.className).toContain("gap-9");
  });

  it("draws the design's stake figure at 36px in its gold", () => {
    render(<RailActionCard {...actionProps()} />);
    const value = screen.getByText("$0.38");
    expect(value.className).toContain("text-[36px]");
    expect(value.className).toContain("#ffe178");
  });
});

describe("status pill colours", () => {
  it("draws the lead pill in solid #ffe178, border and label", () => {
    render(
      <RailActionCard {...actionProps({ badge: { label: "You are in the lead", tone: "lead" } })} />
    );
    const badge = screen.getByTestId("rail-badge");
    // A solid border: the design's 0.742 is the border WIDTH, not an opacity.
    expect(badge.className).toContain("border-[#ffe178]");
    expect(badge.className).not.toContain("border-[#ffe178]/");
    expect(badge.className).toContain("text-[#ffe178]");
  });

  it("draws the behind pill in #ff745b throughout", () => {
    render(
      <RailActionCard
        {...actionProps({ badge: { label: "Another player is leading", tone: "behind" } })}
      />
    );
    const badge = screen.getByTestId("rail-badge");
    expect(badge.className).toContain("border-[#ff745b]");
    expect(badge.className).toContain("text-[#ff745b]");
    expect(badge.querySelector("span[aria-hidden]")?.className).toContain("bg-[#ff745b]");
  });

  it("draws the not-started pill at 65% white", () => {
    render(<RailActionCard {...actionProps()} />);
    const badge = screen.getByTestId("rail-badge");
    expect(badge.className).toContain("border-white/65");
    expect(badge.className).toContain("text-white/65");
  });

  // 930:2012 draws the waiting dot at 7px; 916:84151 the behind dot at 7.416px.
  it("sizes the status dot as the design draws it", () => {
    const { unmount } = render(<RailActionCard {...actionProps()} />);
    let dot = screen.getByTestId("rail-badge").querySelector("span[aria-hidden]");
    expect(dot?.className).toContain("size-[7px]");
    unmount();
    render(
      <RailActionCard
        {...actionProps({ badge: { label: "Another player is leading", tone: "behind" } })}
      />
    );
    dot = screen.getByTestId("rail-badge").querySelector("span[aria-hidden]");
    expect(dot?.className).toContain("size-[7.416px]");
  });

  // 916:84255: the lead pill leads with the crown, not a dot.
  it("crowns the lead pill", () => {
    render(
      <RailActionCard {...actionProps({ badge: { label: "You are in the lead", tone: "lead" } })} />
    );
    const badge = screen.getByTestId("rail-badge");
    const crown = within(badge).getByTestId("rail-badge-crown");
    expect(crown.getAttribute("src")).toBe("/casino/last-standing/rail-crown.svg");
    expect(crown.className).toContain("size-2");
    expect(badge.querySelector("span[aria-hidden]")).toBeNull();
  });

  it("keeps the crown off the other two pills", () => {
    for (const tone of ["behind", "waiting"] as const) {
      const { unmount } = render(
        <RailActionCard {...actionProps({ badge: { label: tone, tone } })} />
      );
      expect(screen.queryByTestId("rail-badge-crown")).toBeNull();
      unmount();
    }
  });

  // 847:79800: "Ready to claim" is lead-coloured but leads with a gold dot.
  it("leads the ready-to-claim pill with a gold dot, not the crown", () => {
    render(<RailClaimCard {...claimProps()} />);
    const badge = screen.getByTestId("rail-badge");
    expect(screen.queryByTestId("rail-badge-crown")).toBeNull();
    expect(badge.querySelector("span[aria-hidden]")?.className).toContain("bg-[#ffe178]");
  });

  // 847:79799 is padded evenly; the three header pills are not.
  it("pads the ready-to-claim pill evenly", () => {
    render(<RailClaimCard {...claimProps()} />);
    const badge = screen.getByTestId("rail-badge");
    expect(badge.className).toContain("px-[14.562px]");
  });
});

describe("the you-earn chip is a chip, not a status pill", () => {
  // B6 is its own element: a 4%-white pill at radius 50px with no border and no
  // dot. It shipped as a bordered B5 status pill, which is a different control
  // saying a different thing.
  it("draws the design's chip", () => {
    render(<RailInviteCard {...inviteProps()} />);
    const chip = screen.getByTestId("rail-chip");
    expect(chip.textContent).toBe("You earn 10%");
    expect(chip.className).toContain("rounded-[50px]");
    expect(chip.className).toContain("bg-white/[0.05]");
    expect(chip.className).toContain("text-[#f4f4f4]/40");
    expect(chip.className).toContain("text-[11px]");
    expect(chip.className).not.toContain("border");
    expect(chip.querySelector("span[aria-hidden]")).toBeNull();
  });

  it("does not dress it as a status pill", () => {
    render(<RailInviteCard {...inviteProps()} />);
    expect(screen.queryByTestId("rail-badge")).toBeNull();
  });
});

describe("typography", () => {
  it("sets the rail heading at 24px in #f4f4f4", () => {
    render(<RailActionCard {...actionProps()} />);
    const heading = screen.getByRole("heading", { name: "Start The Round" });
    expect(heading.className).toContain("text-[24px]");
    expect(heading.className).toContain("#f4f4f4");
    expect(heading.className).toContain("tracking-[-0.96px]");
  });

  // T17 tracks looser than T16 at the same size — the file's own difference.
  it("tracks the claim heading at -0.48px", () => {
    render(<RailClaimCard {...claimProps()} />);
    expect(screen.getByRole("heading", { name: "Claim Your Winnings" }).className).toContain(
      "tracking-[-0.48px]"
    );
  });

  // T22: the invite card's heading is a 15px line, not the 24px display.
  it("sets the invite heading at 15px", () => {
    render(<RailInviteCard {...inviteProps()} />);
    expect(screen.getByRole("heading", { name: "Invite players" }).className).toContain(
      "text-[15px]"
    );
  });

  // Mona Sans SemiBold, on all seven sites that were inheriting Geist.
  it("puts Mona Sans on every small label", () => {
    render(<RailActionCard {...actionProps()} />);
    for (const text of ["Be the last man and win the winner's share.", "Play Amount", "USD"]) {
      expect(screen.getByText(text).className).toContain("font-serif");
    }
  });

  it("puts Mona Sans on the invite caption", () => {
    render(<RailInviteCard {...inviteProps()} />);
    expect(screen.getByText("Scan to join game.").className).toContain("font-serif");
  });

  it("puts Mona Sans on the claim label and both summary columns", () => {
    render(<RailClaimCard {...claimProps()} />);
    expect(screen.getByText("Winner's Share").className).toContain("font-serif");
    // The row carries the face and the tracking; both columns inherit them.
    const row = screen.getAllByTestId("rail-claim-row")[0];
    expect(row?.className).toContain("font-serif");
    expect(row?.className).toContain("tracking-[-0.12px]");
    expect(within(row as HTMLElement).getByText("Final pot")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("$1.16")).toBeTruthy();
  });

  it("draws the claim divider as the design's 1.5px rule at 10%", () => {
    const { container } = render(<RailClaimCard {...claimProps()} />);
    const rule = container.querySelector("[data-testid='rail-claim-rule']");
    expect(rule?.className).toContain("h-[1.5px]");
    expect(rule?.className).toContain("bg-white/10");
    expect(rule?.className).not.toContain("border-hairline");
  });
});

describe("QR tile", () => {
  // 128x128 at radius 10px. The caller hands in a 112px code, and the tile's
  // 8px padding is the quiet zone that makes the pair 128.
  it("frames the code in a 128px tile at 10px", () => {
    render(<RailInviteCard {...inviteProps()} />);
    const tile = screen.getByTestId("rail-qr");
    expect(tile.className).toContain("size-32");
    expect(tile.className).toContain("rounded-[10px]");
    expect(tile.className).not.toContain("rounded-xl");
  });
});

describe("RailCardFrame", () => {
  it("draws the shared shell and its children", () => {
    render(
      <RailCardFrame label="Round actions">
        <p>inside</p>
      </RailCardFrame>
    );
    const frame = screen.getByRole("region", { name: "Round actions" });
    expect(frame.className).toContain("bg-[#121314]");
    expect(frame.className).toContain("rounded-[15px]");
    expect(frame.className).toContain("min-h-[372px]");
    expect(within(frame).getByText("inside")).toBeTruthy();
  });

  it("pins the footer inside the card, at its foot", () => {
    render(
      <RailCardFrame footer={<span>dots</span>}>
        <p>body</p>
      </RailCardFrame>
    );
    const frame = screen.getByTestId("rail-card-frame");
    const footer = screen.getByTestId("rail-card-footer");
    expect(frame.contains(footer)).toBe(true);
    expect(frame.lastElementChild).toBe(footer);
    expect(footer.className).toContain("mt-auto");
    expect(within(footer).getByText("dots")).toBeTruthy();
  });

  it("draws no footer slot without one", () => {
    render(
      <RailCardFrame>
        <p>body</p>
      </RailCardFrame>
    );
    expect(screen.queryByTestId("rail-card-footer")).toBeNull();
  });

  it.each([
    ["action", <RailActionCard {...actionProps()} footer={<i data-testid="pager" />} key="a" />],
    ["invite", <RailInviteCard {...inviteProps()} footer={<i data-testid="pager" />} key="i" />],
    ["claim", <RailClaimCard {...claimProps()} footer={<i data-testid="pager" />} key="c" />],
  ])("renders the %s card's footer inside it", (name, element) => {
    const { container } = render(element);
    const card = container.querySelector(`[data-rail-card="${name}"]`);
    expect(card?.contains(screen.getByTestId("pager"))).toBe(true);
    expect(card?.getAttribute("data-testid")).toBe("rail-card-frame");
  });

  // The bug: `sm:max-w-[295px]` held the card to 295px from 640px to 979px,
  // where the rail is stacked full width, leaving the rest of the row empty.
  it.each([
    ["action", <RailActionCard {...actionProps()} key="a" />],
    ["invite", <RailInviteCard {...inviteProps()} key="i" />],
    ["claim", <RailClaimCard {...claimProps()} key="c" />],
  ])("fills its column at every width (%s)", (name, element) => {
    const { container } = render(element);
    const card = container.querySelector(`[data-rail-card="${name}"]`);
    expect(card?.className).toContain("w-full");
    expect(card?.className).not.toMatch(/max-w-\[\d/u);
    // Nothing inside the card caps itself at the design's 295px either.
    for (const el of card?.querySelectorAll("*") ?? []) {
      expect(el.getAttribute("class") ?? "").not.toMatch(
        /(?:^|\s)(?:\w+:)?(?:max-)?w-\[(?:295|229)px\]/u
      );
    }
  });
});
