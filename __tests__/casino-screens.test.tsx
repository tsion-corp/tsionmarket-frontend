import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LobbySection } from "@/components/dashboard/casino/chess/lobby-section";
import { CreateSection } from "@/components/dashboard/casino/chess/create-section";
import { InviteSection } from "@/components/dashboard/casino/chess/invite-section";
import { PlaySection } from "@/components/dashboard/casino/chess/play-section";
import { DrawSection } from "@/components/dashboard/casino/draw/draw-section";
import { GameTile } from "@/components/dashboard/casino/game-tile";
import { CASINO_GAMES } from "@/lib/casino/games";

// The screens under test are presentational: they read demo fixtures and pure
// stake math, so only the router and the withdraw modal (which pulls in the
// wallet stack) need standing in.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/casino",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/dashboard/modals/withdraw-modal", () => ({
  WithdrawModal: () => <div>withdraw modal</div>,
}));

describe("casino chess lobby", () => {
  it("shows both entry points and the open challenges with formatted stakes", () => {
    render(<LobbySection />);

    expect(screen.getByText("Create staked game")).toBeInTheDocument();
    expect(screen.getByText("Quick match")).toBeInTheDocument();

    // Stakes come from minor units, so this proves the formatting seam works.
    expect(screen.getByText("₦150,000")).toBeInTheDocument();
    expect(screen.getByText("60.00 USDC")).toBeInTheDocument();
    expect(screen.getByText("4.00 SOL")).toBeInTheDocument();

    // Each challenge row links to the play screen carrying its own stake.
    const joins = screen.getAllByRole("link", { name: "Join" });
    expect(joins).toHaveLength(5);
    expect(joins[0]).toHaveAttribute("href", "/casino/chess/play?stake=15000000&cur=NGN&tc=10%2B0");
  });

  it("links live games to the spectator view", () => {
    render(<LobbySection />);
    const watch = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/casino/chess/watch");
    expect(watch.length).toBeGreaterThan(0);
  });
});

describe("casino create staked game", () => {
  it("derives the fee and potential winnings from the typed stake", () => {
    render(<CreateSection />);

    // Default ₦50,000: pot ₦100,000, 5% fee ₦5,000, winner takes ₦95,000.
    expect(screen.getByText("−₦5,000")).toBeInTheDocument();
    expect(screen.getByText("₦95,000")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("50000"), { target: { value: "10000" } });
    expect(screen.getByText("−₦1,000")).toBeInTheDocument();
    expect(screen.getByText("₦19,000")).toBeInTheDocument();
  });

  it("reformats the summary when the currency changes", () => {
    render(<CreateSection />);
    fireEvent.click(screen.getByRole("button", { name: "USDC" }));
    expect(screen.getByText("−5000.00 USDC")).toBeInTheDocument();
  });

  it("reveals the invite link only after the stake is locked", () => {
    render(<CreateSection />);
    expect(screen.queryByText(/worldstreet.app\/chess\/i\//)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Lock stake & get invite link/ }));
    expect(screen.getByText(/worldstreet.app\/chess\/i\//)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute(
      "href",
      "/casino/chess/invite?stake=5000000&cur=NGN&tc=5%2B3"
    );
  });

  it("switches the primary action to matchmaking in auto mode", () => {
    render(<CreateSection />);
    fireEvent.click(screen.getByRole("button", { name: "Match me automatically" }));
    expect(screen.getByRole("link", { name: /Lock stake & find opponent/ })).toHaveAttribute(
      "href",
      "/casino/chess/matchmaking?stake=5000000&cur=NGN&tc=5%2B3"
    );
  });
});

describe("casino invite landing", () => {
  it("states the stake, the fee, and what the winner takes", () => {
    render(<InviteSection stakeMinor={5_000_000} currency="NGN" timeControl="5+3" />);

    expect(screen.getByText("GrandmasterKay")).toBeInTheDocument();
    expect(screen.getByText(/Rating 2210 · 5\+3 Blitz/)).toBeInTheDocument();
    expect(screen.getByText("−₦5,000")).toBeInTheDocument();
    expect(screen.getByText("₦95,000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Accept & stake ₦50,000/ })).toBeInTheDocument();
  });
});

describe("casino chess play", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("opens with the doubled pot, a full board, and white to move", () => {
    render(<PlaySection stakeMinor={2_500_000} currency="NGN" timeControl="5+3" />);

    expect(screen.getByText("₦50,000 pot")).toBeInTheDocument();
    expect(screen.getByText("Your move")).toBeInTheDocument();
    expect(screen.getByText("No moves yet")).toBeInTheDocument();
    // 5+3 puts five minutes on both clocks.
    expect(screen.getAllByText("05:00")).toHaveLength(2);
  });

  it("records a move in the move list when a pawn is pushed", () => {
    const { container } = render(
      <PlaySection stakeMinor={2_500_000} currency="NGN" timeControl="5+3" />
    );
    const squares = container.querySelectorAll(".grid.aspect-square > div");
    expect(squares).toHaveLength(64);

    // Select the e2 pawn (row 6, col 4) then push it to e4 (row 4, col 4).
    fireEvent.click(squares[6 * 8 + 4]);
    fireEvent.click(squares[4 * 8 + 4]);

    expect(screen.getByText(/1\. e4/)).toBeInTheDocument();
  });

  it("ends the game with a zero payout when the player resigns", () => {
    render(<PlaySection stakeMinor={2_500_000} currency="NGN" timeControl="5+3" />);
    fireEvent.click(screen.getByRole("button", { name: "Resign" }));

    expect(screen.getByText("Resigned · You lost")).toBeInTheDocument();
    expect(screen.getByText("₦0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rematch same stake" })).toBeInTheDocument();
  });
});

describe("casino draw", () => {
  it("blocks confirmation until five numbers are picked", () => {
    const { container } = render(<DrawSection />);
    // 1–10 appear in both the main and bonus grids, so scope to the main one.
    const mainGrid = container.querySelector(".grid-cols-7")!;

    // Seeded with three picks, so two are still outstanding.
    expect(screen.getByRole("button", { name: "Pick 2 more numbers" })).toBeDisabled();

    fireEvent.click(within(mainGrid as HTMLElement).getByRole("button", { name: "1" }));
    expect(screen.getByRole("button", { name: "Pick 1 more number" })).toBeDisabled();

    fireEvent.click(within(mainGrid as HTMLElement).getByRole("button", { name: "2" }));
    expect(screen.getByRole("button", { name: "Confirm entry" })).toBeEnabled();
  });

  it("stops accepting picks once five are chosen", () => {
    const { container } = render(<DrawSection />);
    const mainGrid = within(container.querySelector(".grid-cols-7") as HTMLElement);

    fireEvent.click(mainGrid.getByRole("button", { name: "1" }));
    fireEvent.click(mainGrid.getByRole("button", { name: "2" }));
    expect(screen.getByRole("button", { name: "Confirm entry" })).toBeEnabled();

    // A sixth pick is ignored, and deselecting one reopens a slot.
    fireEvent.click(mainGrid.getByRole("button", { name: "3" }));
    expect(screen.getByRole("button", { name: "Confirm entry" })).toBeEnabled();

    fireEvent.click(mainGrid.getByRole("button", { name: "1" }));
    expect(screen.getByRole("button", { name: "Pick 1 more number" })).toBeDisabled();
  });

  it("prices entries at ₦500 each and steps the count", () => {
    render(<DrawSection />);
    expect(screen.getByText("₦1,500")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText("4 entries")).toBeInTheDocument();
    expect(screen.getByText("₦2,000")).toBeInTheDocument();
  });

  it("quick pick fills exactly five main numbers", () => {
    render(<DrawSection />);
    fireEvent.click(screen.getByRole("button", { name: "Quick pick" }));
    expect(screen.getByRole("button", { name: "Confirm entry" })).toBeEnabled();
  });
});

describe("casino game tile", () => {
  it("links playable games and leaves coming-soon ones inert", () => {
    const chess = CASINO_GAMES.find((g) => g.id === "chess")!;
    const poker = CASINO_GAMES.find((g) => g.id === "poker")!;

    const { rerender, container } = render(<GameTile game={chess} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/casino/chess");
    expect(within(container).getByText("POPULAR")).toBeInTheDocument();

    rerender(<GameTile game={poker} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("COMING SOON")).toBeInTheDocument();
  });

  it("gives the vault game a tile that opens its route", () => {
    const lastStanding = CASINO_GAMES.find((g) => g.id === "last-standing")!;
    render(<GameTile game={lastStanding} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/casino/last-standing");
    expect(screen.getByText("Last Man Standing")).toBeInTheDocument();
  });
});
