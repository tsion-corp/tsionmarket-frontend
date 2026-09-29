import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import enMessages from "@/messages/en.json";
import { HowItWorks } from "@/features/casino/components/last-standing/how-it-works";

const ls = enMessages.casino.lastStanding;

function renderHowItWorks() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <HowItWorks />
    </NextIntlClientProvider>
  );
}

describe("HowItWorks facts", () => {
  // The chain card used to name the network and the fee. The pitch now is what
  // running on a chain means to a player: nobody but the players has a hand
  // on the game.
  it("says the game runs on the blockchain, and what that buys the player", () => {
    renderHowItWorks();
    expect(screen.getByText(ls.howFactChain)).toBeInTheDocument();
    expect(screen.getByText("Blockchain")).toBeInTheDocument();
    expect(screen.getByText(ls.howFactChainBody)).toBeInTheDocument();
    expect(ls.howFactChainBody).toBe("No one controls the game other than the players.");
    expect(screen.queryByText("Base")).toBeNull();
  });
});
