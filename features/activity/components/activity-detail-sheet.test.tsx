import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import enMessages from "@/messages/en.json";
import { messageLabel, textLabel, toneFor, type ActivityFeedItem } from "@/lib/activity/feed";

import { ActivityDetailSheet } from "./activity-detail-sheet";

// The detail behind an All Activity row (ADR-2026-09-23): the event, then
// exactly two actions — share it to Market Square, and open it on the chain
// that carries it. No cash-out, no In Progress, no tab strip.
//
// The real catalogue, not an overlay: a key this sheet looks up that is missing
// from messages/en.json fails here rather than passing against a fixture.
const messages = enMessages;

// The share sheet is a shared surface of its own with its own suite; what
// matters here is the draft this sheet hands it. The stub puts the draft on
// attributes so a wiring test can read the deep link that will be posted
// without standing up the Market Square client.
vi.mock("@/components/share/share-to-square", () => ({
  ShareToSquare: ({
    draft,
    open,
    onClose,
  }: {
    draft: { title: string; subtitle?: string; deepLink: { kind: string; ref: string } };
    open: boolean;
    onClose: () => void;
  }) =>
    open ? (
      <div
        data-testid="share-sheet"
        data-kind={draft.deepLink.kind}
        data-ref={draft.deepLink.ref}
        data-title={draft.title}
        data-subtitle={draft.subtitle ?? ""}
      >
        <button type="button" onClick={onClose}>
          Cancel share
        </button>
      </div>
    ) : null,
}));

const HASH = "0xabc1230000000000000000000000000000000000000000000000000000000def";

function feedItem(overrides: Partial<ActivityFeedItem> = {}): ActivityFeedItem {
  const status = overrides.status ?? "completed";
  return {
    id: "act-1",
    occurredAt: new Date(2026, 8, 9, 14, 32).getTime(),
    product: "transfer",
    title: messageLabel("sent", { symbol: "USDC" }),
    status,
    tone: toneFor(status),
    icon: { symbol: "USDC", logo: null },
    amount: { value: "-250", symbol: "USDC", signed: true },
    caption: { label: messageLabel("captions.amountSent"), detail: "USD" },
    onChain: { network: "base-mainnet", hash: HASH },
    ...overrides,
  };
}

/** A played chess match: a game reference, and never a transaction. */
function gameItem(overrides: Partial<ActivityFeedItem> = {}): ActivityFeedItem {
  return feedItem({
    id: "act-game",
    product: "arkade",
    title: messageLabel("won_chess"),
    subtitle: messageLabel("subtitles.versus", { opponent: "0xab…cd" }),
    status: "won",
    tone: toneFor("won"),
    amount: { value: "40", symbol: "USDC", signed: true },
    caption: { label: messageLabel("captions.amountReceived") },
    onChain: undefined,
    game: { game: "chess", matchId: "match-9" },
    ...overrides,
  });
}

/** A daily check-in: no chain, no match, so neither action has anything to point at. */
function offChainItem(overrides: Partial<ActivityFeedItem> = {}): ActivityFeedItem {
  return feedItem({
    id: "act-reward",
    product: "rewards",
    title: textLabel("Daily check-in"),
    status: "earned",
    tone: toneFor("earned"),
    icon: { symbol: "KASH+", logo: "/kash/kash-plus-coin.png" },
    amount: { value: "25", symbol: "KASH+", signed: true },
    caption: { label: messageLabel("captions.rewardPoints") },
    onChain: undefined,
    ...overrides,
  });
}

function renderSheet(item: ActivityFeedItem | null, onClose = vi.fn()) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ActivityDetailSheet item={item} onClose={onClose} />
    </NextIntlClientProvider>
  );
  return { ...view, onClose };
}

describe("ActivityDetailSheet open state", () => {
  it("renders nothing at all while there is no item", () => {
    renderSheet(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("opens a labelled modal dialog for an item, portalled out of its caller", () => {
    const { container } = renderSheet(feedItem());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Activity Details");
    expect(container).not.toContainElement(dialog);
  });

  it("closes on the shell's own close button", () => {
    const { onClose } = renderSheet(feedItem());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const { onClose } = renderSheet(feedItem());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("ActivityDetailSheet content", () => {
  it("shows the event: title, status, amount, caption, time and product", () => {
    renderSheet(feedItem());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Sent USDC");
    expect(dialog).toHaveTextContent("Completed");
    expect(dialog).toHaveTextContent("-250 USDC");
    expect(dialog).toHaveTextContent("Amount Sent");
    expect(dialog).toHaveTextContent("USD");
    expect(dialog).toHaveTextContent("Transfer");
    expect(screen.getByText("When")).toBeInTheDocument();
  });

  it("tints a negative amount down and keeps the exact figure on its title", () => {
    renderSheet(feedItem());
    const amount = screen.getByText("-250 USDC");
    expect(amount).toHaveClass("text-down");
    expect(amount).toHaveAttribute("title", `-250 USDC`);
  });

  it("shows the transaction hash truncated, with the whole hash on its title", () => {
    renderSheet(feedItem());
    expect(screen.getByText("Transaction")).toBeInTheDocument();
    const hash = screen.getByText("0xabc1…0def");
    expect(hash).toHaveAttribute("title", HASH);
  });

  it("shows the subtitle when the item carries one", () => {
    renderSheet(gameItem());
    expect(screen.getByRole("dialog")).toHaveTextContent("vs 0xab…cd");
  });

  it("names no transaction for an item that never touched a chain", () => {
    renderSheet(offChainItem());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Daily check-in");
    expect(dialog).toHaveTextContent("Reward Points");
    expect(screen.queryByText("Transaction")).not.toBeInTheDocument();
  });
});

describe("ActivityDetailSheet actions", () => {
  it("offers both actions for a chain transfer", () => {
    renderSheet(feedItem());
    expect(screen.getByRole("button", { name: "Share to Market Square" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View on Base" })).toBeInTheDocument();
  });

  it("points the explorer link at the right chain and opens it safely", () => {
    renderSheet(feedItem());
    const link = screen.getByRole("link", { name: "View on Base" });
    expect(link).toHaveAttribute("href", `https://basescan.org/tx/${HASH}`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("keeps the share control a sibling of the explorer anchor, never inside it", () => {
    renderSheet(feedItem());
    const link = screen.getByRole("link", { name: "View on Base" });
    const share = screen.getByRole("button", { name: "Share to Market Square" });
    expect(link).not.toContainElement(share);
    expect(share).not.toContainElement(link);
    expect(link.parentElement).toBe(share.parentElement);
  });

  it("renders no explorer button at all for a chain with no explorer", () => {
    // Absent, not disabled and not a dead anchor: there is nothing to open.
    renderSheet(feedItem({ onChain: { network: "gensyn-mainnet", hash: HASH } }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share to Market Square" })).toBeInTheDocument();
  });

  it("renders no explorer button for an off-chain game, which has no transaction", () => {
    renderSheet(gameItem());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the event with no actions at all when it has neither reference", () => {
    renderSheet(offChainItem());
    expect(screen.getByRole("dialog")).toHaveTextContent("Daily check-in");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Share to Market Square" })
    ).not.toBeInTheDocument();
  });
});

describe("ActivityDetailSheet sharing", () => {
  it("shares a transfer through its transaction, as network:hash", () => {
    renderSheet(feedItem());
    fireEvent.click(screen.getByRole("button", { name: "Share to Market Square" }));
    const sheet = screen.getByTestId("share-sheet");
    expect(sheet).toHaveAttribute("data-kind", "trade");
    expect(sheet).toHaveAttribute("data-ref", `base-mainnet:${HASH}`);
    expect(sheet).toHaveAttribute("data-title", "Sent USDC");
  });

  it("shares a played game through its match, never through a chain hash", () => {
    renderSheet(gameItem());
    fireEvent.click(screen.getByRole("button", { name: "Share to Market Square" }));
    const sheet = screen.getByTestId("share-sheet");
    expect(sheet).toHaveAttribute("data-kind", "game");
    expect(sheet).toHaveAttribute("data-ref", "chess:match-9");
    expect(sheet).toHaveAttribute("data-title", "Won chess");
  });

  it("keeps money out of the card the square shows, so it stays the opt-in", () => {
    renderSheet(feedItem());
    fireEvent.click(screen.getByRole("button", { name: "Share to Market Square" }));
    expect(screen.getByTestId("share-sheet").getAttribute("data-subtitle")).not.toContain("250");
  });

  it("closes the share sheet without closing the detail behind it", () => {
    const { onClose } = renderSheet(feedItem());
    fireEvent.click(screen.getByRole("button", { name: "Share to Market Square" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel share" }));
    expect(screen.queryByTestId("share-sheet")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves Escape to the share sheet while it is the surface on top", () => {
    const { onClose } = renderSheet(feedItem());
    fireEvent.click(screen.getByRole("button", { name: "Share to Market Square" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ActivityDetailSheet reopening", () => {
  it("does not reopen the share composer on the next row", () => {
    // Sharing is local state, and the sheet is reused for every row rather than
    // remounted per row. If that state outlived the item, opening any later row
    // would drop the reader straight into a composer they never asked for,
    // carrying the previous event's draft.
    const { rerender } = renderSheet(feedItem());
    fireEvent.click(screen.getByRole("button", { name: "Share to Market Square" }));
    expect(screen.getByTestId("share-sheet")).toBeInTheDocument();

    const show = (item: ActivityFeedItem | null) =>
      rerender(
        <NextIntlClientProvider locale="en" messages={messages}>
          <ActivityDetailSheet item={item} onClose={vi.fn()} />
        </NextIntlClientProvider>
      );
    show(null);
    show(feedItem());
    expect(screen.queryByTestId("share-sheet")).not.toBeInTheDocument();
  });
});
