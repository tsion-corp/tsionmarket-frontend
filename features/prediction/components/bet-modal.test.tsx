import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prediction } from "@/lib/types";
import type { ShineEvent } from "@/lib/shine/types";

const mocks = vi.hoisted(() => ({
  placeBet: vi.fn(),
  reportShine: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/shine", () => ({ reportShine: mocks.reportShine }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track: mocks.track }));
vi.mock("@/lib/toast", () => ({
  toast: { loading: () => "toast-1", success: vi.fn(), error: vi.fn() },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/currency-select", () => ({
  useMoney: () => ({ formatExact: (value: number) => `$${value.toFixed(2)}` }),
}));
vi.mock("../hooks/use-prediction-consent", () => ({
  usePredictionConsent: () => ({ accepted: true, accept: vi.fn() }),
}));
vi.mock("../hooks/use-bet", () => ({
  useBet: () => ({
    placeBet: mocks.placeBet,
    phase: "idle",
    error: null,
    sessionStatus: "idle",
    usdcTotal: 100,
    predictionBalanceUsd: 50,
    portfolioLoading: false,
  }),
}));

import { PredictionBetForm } from "./bet-modal";

const prediction: Prediction = {
  tag: "Weather",
  vol: "$1m",
  q: "Will it rain in Lagos on Friday?",
  yes: "50¢",
  no: "50¢",
  pct: 50,
  yesTokenId: "yes-token",
  noTokenId: "no-token",
  // Present, and deliberately never reported: no route in this app takes one.
  conditionId: "0xcondition",
  eventId: "12345",
};

function place() {
  fireEvent.click(screen.getByRole("button", { name: "placeBetYes" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.placeBet.mockResolvedValue({
    ok: true,
    orderId: "0xorder",
    status: "matched",
    makingAmount: "5",
    takingAmount: "10",
    transactionsHashes: [],
    tradeIds: ["trade-1"],
  });
});

describe("what a filled prediction order reports to Shine", () => {
  it("reports the fill once, with the market's question and the price it paid", async () => {
    render(<PredictionBetForm prediction={prediction} side="yes" onClose={vi.fn()} />);
    place();

    await waitFor(() => expect(mocks.reportShine).toHaveBeenCalledTimes(1));
    expect(mocks.reportShine).toHaveBeenCalledWith({
      service: "prediction",
      id: "0xorder",
      market: "Will it rain in Lagos on Friday?",
      outcome: "Yes",
      price: "$0.50",
    });
  });

  it("never carries the condition id, which identifies nothing a reader could open", async () => {
    render(<PredictionBetForm prediction={prediction} side="no" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "placeBetNo" }));

    await waitFor(() => expect(mocks.reportShine).toHaveBeenCalledTimes(1));
    const event = mocks.reportShine.mock.calls[0][0] as ShineEvent;
    expect(JSON.stringify(event)).not.toContain("0xcondition");
    expect(event).toMatchObject({ id: "0xorder", outcome: "No" });
    // Analytics keeps its own identifier, and that is not this one: the
    // selection names the market, and the placed bet reports the slip.
    expect(mocks.track).toHaveBeenCalledWith(
      "prediction_selection_added",
      expect.objectContaining({ market_id: "0xcondition" })
    );
    expect(mocks.track).toHaveBeenCalledWith(
      "prediction_bet_placed",
      expect.objectContaining({ leg_count: 1 })
    );
  });

  it("reports nothing when the order was not accepted", async () => {
    mocks.placeBet.mockRejectedValue(new Error("no liquidity"));
    render(<PredictionBetForm prediction={prediction} side="yes" onClose={vi.fn()} />);
    place();

    await waitFor(() => expect(mocks.placeBet).toHaveBeenCalled());
    expect(mocks.reportShine).not.toHaveBeenCalled();
  });
});
