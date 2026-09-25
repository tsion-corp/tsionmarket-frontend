// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HlClosedPositionView, HlPositionView } from "@/features/trade/lib/hyperliquid-types";
import type { ShineEvent } from "@/lib/shine";

/**
 * What a closed perps position tells Shine.
 *
 * The report lives here rather than on the desk because this is the only place
 * the venue's final record is read: the desk's positions watcher can say the
 * position is gone, but not what it closed at or what it returned. The same
 * record draws the share card this popup is about, so the post and the card
 * cannot disagree about the same trade.
 */

const shine = vi.hoisted(() => ({ reportShine: vi.fn() }));
vi.mock("@/lib/shine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shine")>()),
  reportShine: shine.reportShine,
}));

const closedRows = vi.hoisted(() => ({ value: [] as unknown[] }));
const api = vi.hoisted(() => ({ listClosedPositions: vi.fn() }));
vi.mock("@/features/trade/lib/hyperliquid-api", () => ({
  listClosedPositions: api.listClosedPositions,
}));

// The modals the list hosts are not what these tests are about. The close
// modal is reduced to a button so a close can be confirmed without driving its
// own UI.
vi.mock("@/features/trade/components/hyperliquid-close-position-modal", () => ({
  HyperliquidClosePositionModal: ({
    position,
    onConfirm,
  }: {
    position: HlPositionView | null;
    onConfirm: (p: HlPositionView) => Promise<void>;
  }) =>
    position ? (
      <button data-testid="confirm-close" onClick={() => void onConfirm(position)}>
        confirm
      </button>
    ) : null,
}));
vi.mock("@/features/trade/components/hyperliquid-history-modal", () => ({
  HyperliquidHistoryModal: () => null,
}));
vi.mock("@/features/trade/components/hyperliquid-pnl-share-modal", () => ({
  HyperliquidPnlShareModal: () => null,
}));
vi.mock("@/features/trade/components/hyperliquid-trigger-modal", () => ({
  HyperliquidTriggerModal: () => null,
}));

import { HyperliquidPositionsList } from "@/features/trade/components/hyperliquid-positions-list";

function openPosition(over: Partial<HlPositionView> = {}): HlPositionView {
  return {
    id: "position-1",
    walletId: "wallet-1",
    assetId: "asset-btc",
    entryOrderId: "order-1",
    side: "long",
    size: "0.0156",
    entryPrice: "64000",
    leverage: 10,
    marginMode: "isolated",
    status: "open",
    closeReason: null,
    closePrice: null,
    realizedPnlUsdc: null,
    markPrice: "64100",
    unrealizedPnlUsdc: "1.2",
    accruedFundingUsdc: "0",
    openedAt: new Date().toISOString(),
    closedAt: null,
    ...over,
  };
}

// The venue's final record. Entry $64,000 on 0.0156 BTC at 10x is $998.40 of
// notional and $99.84 of margin; $49.92 realised is a +50% return, which is
// exactly what the share card computes from the same row.
function closedPosition(over: Partial<HlClosedPositionView> = {}): HlClosedPositionView {
  return {
    id: "position-1",
    walletId: "wallet-1",
    assetId: "asset-btc",
    symbol: "BTC",
    side: "long",
    size: "0.0156",
    entryPrice: "64000",
    leverage: 10,
    marginMode: "isolated",
    status: "closed",
    closeReason: "manual_close",
    closePrice: "67200",
    realizedPnlUsdc: "49.92",
    openedAt: new Date(Date.now() - 60_000).toISOString(),
    closedAt: new Date().toISOString(),
    ...over,
  };
}

function reported(): ShineEvent[] {
  return shine.reportShine.mock.calls.map((call) => call[0] as ShineEvent);
}

function renderList(positions: HlPositionView[] = [openPosition()]) {
  return render(
    <HyperliquidPositionsList
      positions={positions}
      orders={[]}
      loading={false}
      busy={false}
      walletId="wallet-1"
      onClosePosition={vi.fn(async () => {})}
      onEditTrigger={vi.fn(async () => {})}
    />
  );
}

// Presses Close on the row, then confirms, then lets the record poll run.
async function close() {
  renderList();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await act(async () => {
    fireEvent.click(screen.getByTestId("confirm-close"));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  closedRows.value = [];
  api.listClosedPositions.mockImplementation(async () => closedRows.value);
});

describe("a closed perps position", () => {
  it("reports once, keyed on the position id, with the close price and the return", async () => {
    closedRows.value = [closedPosition()];

    await close();

    expect(reported()).toEqual([
      {
        service: "perps",
        id: "position-1",
        kind: "close",
        symbol: "BTC-USDC",
        side: "long",
        price: "$67,200.00",
        pnl: "+50%",
      },
    ]);
  });

  it("states a loss as a loss", async () => {
    // -$24.96 against $99.84 of margin is -25%.
    closedRows.value = [closedPosition({ closePrice: "62400", realizedPnlUsdc: "-24.96" })];

    await close();

    expect(reported()[0]).toMatchObject({ price: "$62,400.00", pnl: "-25%" });
  });

  it("reports a short as a short", async () => {
    closedRows.value = [closedPosition({ side: "short" })];

    await close();

    expect(reported()[0]).toMatchObject({ kind: "close", side: "short" });
  });

  /**
   * The backlog case. This list reads a poll, so unlike the imperative call
   * sites it could in principle serve old state — and on the day Shine ships
   * the dedup store is empty, so every old row would be a first post. A Shine
   * post carries no date, so a close from last month would read as today's.
   */
  it("reports nothing for a close that settled more than a day ago", async () => {
    closedRows.value = [
      closedPosition({ closedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }),
    ];

    await close();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("reports nothing when the record has no settlement time", async () => {
    closedRows.value = [closedPosition({ closedAt: "" })];

    await close();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  // The poll only ever looks for the one id the user just closed, so a record
  // for any other position is not this client's business.
  it("reports nothing about another position in the same history", async () => {
    closedRows.value = [closedPosition({ id: "position-other" })];

    await close();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("states no return when the record's figures cannot be read exactly", async () => {
    closedRows.value = [closedPosition({ realizedPnlUsdc: "n/a" })];

    await close();

    expect(reported()[0]).toMatchObject({ kind: "close", price: "$67,200.00", pnl: null });
  });

  it("reports nothing until the record exists", async () => {
    closedRows.value = [];

    await close();

    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});
