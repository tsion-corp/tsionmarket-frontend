import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import {
  ArkBallCard,
  CheckersCard,
  LastManCard,
  SquareCard,
} from "@/features/discovery/components/conversation-cards";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

function renderWithIntl(ui: ReactNode) {
  return render(<>{ui}</>, { wrapper });
}

const link = (name: RegExp) => screen.getByRole("link", { name });

describe("Last Man card", () => {
  it("invites a round to start when none is open", () => {
    renderWithIntl(<LastManCard round={null} remainingMs={null} />);
    expect(screen.getByText("Outlast everyone. Winner takes the pot.")).toBeInTheDocument();
    expect(link(/Start a round/)).toHaveAttribute("href", "/casino/last-standing");
    expect(link(/How it works/)).toHaveAttribute("href", "/casino/last-standing");
  });

  it("links into the open round, with the pot and the clock on the card", () => {
    renderWithIntl(
      <LastManCard
        round={{ gameId: 42, endTime: 0, potUsd: 1240, pot: "$1,240" }}
        remainingMs={(1 * 3600 + 46 * 60 + 55) * 1000}
      />
    );
    expect(screen.getByText("$1,240 in the pot")).toBeInTheDocument();
    expect(screen.getByText("01:46:55")).toBeInTheDocument();
    expect(link(/Join the round/)).toHaveAttribute("href", "/casino/last-standing/42");
  });

  it("treats a round whose clock has run out as no round", () => {
    renderWithIntl(
      <LastManCard round={{ gameId: 42, endTime: 0, potUsd: 1, pot: "$1" }} remainingMs={0} />
    );
    expect(screen.queryByRole("link", { name: /Join the round/ })).toBeNull();
    expect(link(/Start a round/)).toBeInTheDocument();
  });
});

describe("Checkers card", () => {
  it("counts the matches being played and offers to join one", () => {
    renderWithIntl(<CheckersCard liveCount={3} />);
    expect(screen.getByText("3 matches being played right now")).toBeInTheDocument();
    expect(link(/Join a match/)).toHaveAttribute("href", "/casino/checkers");
    expect(link(/Learn the rules/)).toHaveAttribute("href", "/casino/checkers/learn");
  });

  it("offers a game when nothing is live", () => {
    renderWithIntl(<CheckersCard liveCount={0} />);
    expect(screen.getByText("Fast staked matches. Take the crown.")).toBeInTheDocument();
    expect(link(/Play Checkers/)).toHaveAttribute("href", "/casino/checkers");
  });
});

describe("ArkBall card", () => {
  it("links to the game and to the rest of the Arkade", () => {
    renderWithIntl(<ArkBallCard />);
    expect(screen.getByText("Pick 5 white balls and 1 ArkBall")).toBeInTheDocument();
    expect(link(/Play ArkBall/)).toHaveAttribute("href", "/casino/arkball");
    expect(link(/All games/)).toHaveAttribute("href", "/casino");
  });
});

describe("Market Square card", () => {
  const home = "https://square.example";

  it("opens the live room and the square in new tabs", () => {
    renderWithIntl(
      <SquareCard
        room={{
          id: "r1",
          title: "Base season, who wins",
          host: "Ada",
          avatars: ["https://cdn.example/ada.png"],
          href: `${home}/live/r1`,
        }}
        avatars={["https://cdn.example/ada.png"]}
        homeHref={home}
      />
    );
    expect(screen.getByText("Base season, who wins")).toBeInTheDocument();
    expect(screen.getByText("Live with Ada")).toBeInTheDocument();
    const join = link(/Join live/);
    expect(join).toHaveAttribute("href", `${home}/live/r1`);
    expect(join).toHaveAttribute("target", "_blank");
    expect(join).toHaveAttribute("rel", "noopener noreferrer");
    expect(link(/Open Square/)).toHaveAttribute("href", home);
  });

  it("invites the reader in when no room is live, faces from the design", () => {
    const { container } = renderWithIntl(<SquareCard room={null} avatars={[]} homeHref={home} />);
    expect(screen.getByText("Live rooms on Market Square, all day")).toBeInTheDocument();
    expect(link(/Open Square/)).toHaveAttribute("href", home);
    expect(link(/Start a room/)).toHaveAttribute("target", "_blank");
    expect(container.querySelector('img[src="/market/convo-avatar-4.png"]')).not.toBeNull();
  });
});

describe("card links", () => {
  it("keeps every decoration out of the pointer's way, so the pills are what gets clicked", () => {
    const { container } = renderWithIntl(<ArkBallCard />);
    const article = container.querySelector("article");
    expect(article).not.toBeNull();
    for (const decoration of Array.from(article!.children)) {
      if (decoration.querySelector("a")) continue;
      expect(decoration.className).toContain("pointer-events-none");
    }
  });
});
