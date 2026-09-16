import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { memeToken } from "@/features/trade/lib/meme-fixture";
import { AppModalHost, useAppModals } from "@/components/layout/modals/app-modals";

// The dynamic import in app-modals.tsx resolves this real module, so mocking
// it here is what lets the render branch be checked without pulling in the
// sheet's own wallet, portfolio and trade-service dependencies.
const memeSheetProps: Array<{ defaultSide: string; showRisk: boolean }> = [];
vi.mock("@/features/trade/components/meme-trade-sheet", () => ({
  MemeTradeSheet: (props: { defaultSide: string; showRisk: boolean }) => {
    memeSheetProps.push({ defaultSide: props.defaultSide, showRisk: props.showRisk });
    return <div data-testid="meme-trade-sheet">{props.defaultSide}</div>;
  },
}));

describe("useAppModals openMemeBuy", () => {
  it("puts a memeBuy variant carrying the token in state", () => {
    const { result } = renderHook(() => useAppModals());
    const token = memeToken({ symbol: "PEPE" });

    act(() => result.current.openMemeBuy(token));

    expect(result.current.modal).toEqual({ type: "memeBuy", memeBuy: token });
  });
});

describe("AppModalHost on a memeBuy modal", () => {
  it("renders MemeTradeSheet on the buy side, with risk warnings on", async () => {
    memeSheetProps.length = 0;
    const token = memeToken({ symbol: "PEPE" });

    render(
      <AppModalHost
        active={{ type: "memeBuy", memeBuy: token }}
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />
    );

    expect(await screen.findByTestId("meme-trade-sheet")).toHaveTextContent("BUY");
    expect(memeSheetProps).toEqual([{ defaultSide: "BUY", showRisk: true }]);
  });
});
