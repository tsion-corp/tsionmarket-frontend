import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import {
  ArkBallCard,
  ArkjetCard,
  CheckersCard,
  ChessCard,
  LastManCard,
  PilotChickenCard,
} from "@/features/discovery/components/arkade-cards";

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

// The card is now the event's poster rather than the band's shared frame, so
// the copy it used to carry — the kicker, the headline, the pot and the clock
// — is gone and the wordmark is all it says. What survives is where the pill
// goes, which is the only thing on this card that ever depended on the feed.
describe("Last Man card", () => {
  it("stands on its own wordmark", () => {
    renderWithIntl(<LastManCard round={null} remainingMs={null} />);
    // One heading, not two: the name is broken over two lines by the artwork
    // and has to be read back as the one name it is.
    expect(screen.getByRole("heading", { name: /Last Man\s+Marathon/ })).toBeInTheDocument();
  });

  it("opens the lobby when no round is open", () => {
    renderWithIntl(<LastManCard round={null} remainingMs={null} />);
    expect(link(/Join Now/)).toHaveAttribute("href", "/casino/last-standing");
  });

  it("links into the open round", () => {
    renderWithIntl(
      <LastManCard
        round={{ gameId: 42, endTime: 0, potUsd: 1240, pot: "$1,240" }}
        remainingMs={(1 * 3600 + 46 * 60 + 55) * 1000}
      />
    );
    expect(link(/Join Now/)).toHaveAttribute("href", "/casino/last-standing/42");
  });

  // The pill reads the same in both states now, so the round having run out can
  // only be told from where the pill goes. It must fall back to the lobby
  // rather than deep-linking into a round nobody can still join.
  it("treats a round whose clock has run out as no round", () => {
    renderWithIntl(
      <LastManCard round={{ gameId: 42, endTime: 0, potUsd: 1, pot: "$1" }} remainingMs={0} />
    );
    expect(link(/Join Now/)).toHaveAttribute("href", "/casino/last-standing");
  });

  // The pot was on the old card and the design took it off. A feed value that
  // found its way back onto the poster would be a regression, not a bonus.
  it("keeps the feed's figures off the poster", () => {
    renderWithIntl(
      <LastManCard
        round={{ gameId: 42, endTime: 0, potUsd: 1240, pot: "$1,240" }}
        remainingMs={(1 * 3600 + 46 * 60 + 55) * 1000}
      />
    );
    expect(screen.queryByText(/\$1,240/)).toBeNull();
    expect(screen.queryByText("01:46:55")).toBeNull();
  });
});

describe("Checkers card", () => {
  it("counts the matches being played and offers to join one", () => {
    renderWithIntl(<CheckersCard liveCount={3} />);
    expect(screen.getByText("3 matches being played right now")).toBeInTheDocument();
    expect(link(/Join a match/)).toHaveAttribute("href", "/casino/checkers");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("offers a game when nothing is live", () => {
    renderWithIntl(<CheckersCard liveCount={0} />);
    expect(screen.getByText("Fast staked matches. Take the crown.")).toBeInTheDocument();
    expect(link(/Play Checkers/)).toHaveAttribute("href", "/casino/checkers");
  });
});

describe("ArkBall card", () => {
  it("links to the game, and to it alone", () => {
    renderWithIntl(<ArkBallCard />);
    expect(screen.getByText("Pick 5 white balls and 1 ArkBall")).toBeInTheDocument();
    expect(link(/Play ArkBall/)).toHaveAttribute("href", "/casino/arkball");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});

describe("Chess card", () => {
  it("offers a game and a game to watch", () => {
    renderWithIntl(<ChessCard />);
    expect(screen.getByText(enMessages.discovery.chessHeadline)).toBeInTheDocument();
    expect(link(/Play chess/)).toHaveAttribute("href", "/casino/chess");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});

describe("Arkjet card", () => {
  it("links to the game and to the rest of the Arkade", () => {
    renderWithIntl(<ArkjetCard />);
    expect(screen.getByText(enMessages.discovery.arkjetHeadline)).toBeInTheDocument();
    expect(link(/Play Arkjet/)).toHaveAttribute("href", "/casino/arkjet");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});

describe("Pilot Chicken card", () => {
  it("links to the game and to the rest of the Arkade", () => {
    renderWithIntl(<PilotChickenCard />);
    expect(screen.getByText(enMessages.discovery.chickenHeadline)).toBeInTheDocument();
    expect(link(/Play Pilot Chicken/)).toHaveAttribute("href", "/casino/chicken");
    expect(screen.getAllByRole("link")).toHaveLength(1);
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
