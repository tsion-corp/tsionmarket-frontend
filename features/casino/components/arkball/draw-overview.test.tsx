import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { DrawOverview } from "@/features/casino/components/arkball/draw-overview";
import type { LotteryDraw } from "@/features/casino/lib/api/lottery";
import messages from "@/messages/en.json";

const currentDraw: LotteryDraw = {
  id: "draw-current",
  sequence: 2,
  ruleVersion: 1,
  status: "open",
  salesOpenAt: "2026-08-15T00:00:00Z",
  salesCloseAt: "2026-08-16T18:00:00Z",
  drawAt: "2026-08-16T20:00:00Z",
  totalTickets: 4,
  totalPlayers: 4,
  currentPoolUsdc: "1.48",
  broughtForwardUsdc: "0.00",
  advertisedJackpotUsdc: "1.48",
  cashValueUsdc: "1.48",
  payoutUsdc: "0.00",
  payoutPerWinningTicketUsdc: "0.00",
  rolloverUsdc: "0.00",
  refundedUsdc: "0.00",
  winningTicketCount: 0,
  randomnessProvider: "drand-quicknet",
  randomnessChainHash: "chain-hash",
  randomnessRound: 1,
  randomnessRoundAt: "2026-08-16T20:00:00Z",
  randomnessCommitment: "commitment",
  cancellationReason: null,
  result: null,
  settledAt: null,
};

const latestDraw: LotteryDraw = {
  ...currentDraw,
  id: "draw-latest",
  sequence: 1,
  status: "settled",
  drawAt: "2026-08-15T20:00:00Z",
  result: {
    drawId: "draw-latest",
    whiteNumbers: [1, 2, 3, 4, 5],
    powerNumber: 6,
    randomnessRound: 1,
    randomnessSignature: "signature",
    randomnessValue: "value",
    resultHash: "result-hash",
    drawnAt: "2026-08-15T20:00:00Z",
  },
  settledAt: "2026-08-15T20:01:00Z",
};

describe("DrawOverview", () => {
  it("formats draw dates when the inherited runtime time zone is invalid", () => {
    const onError = vi.fn();

    render(
      <NextIntlClientProvider
        locale="en"
        messages={messages}
        timeZone="Etc/Unknown"
        onError={onError}
      >
        <DrawOverview current={currentDraw} latest={latestDraw} />
      </NextIntlClientProvider>
    );

    expect(screen.getByText("Sat, Aug 15")).toBeInTheDocument();
    expect(screen.getByText("Sun, Aug 16")).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });
});
