import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prediction } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  placeBet: vi.fn(),
}));

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
  conditionId: "0xcondition",
  eventId: "12345",
};

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

describe("placing a prediction bet", () => {
  it("places the order on the chosen side and closes once it fills", async () => {
    const onClose = vi.fn();
    render(<PredictionBetForm prediction={prediction} side="no" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "placeBetNo" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mocks.placeBet).toHaveBeenCalledWith(expect.objectContaining({ tokenId: "no-token" }));
  });
});
