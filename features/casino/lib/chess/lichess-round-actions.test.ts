import { describe, expect, it, vi } from "vitest";
import {
  dispatchLichessRoundAction,
  type LichessRoundActionContext,
} from "./lichess-round-actions";

function actions(overrides: Partial<LichessRoundActionContext> = {}) {
  return {
    match: { drawOffered: null },
    you: "w" as const,
    submitMove: vi.fn(),
    resign: vi.fn(),
    abort: vi.fn(),
    offerDraw: vi.fn(),
    respondToDraw: vi.fn(),
    claimDraw: vi.fn(),
    claimTimeout: vi.fn(),
    takeback: vi.fn(),
    declineTakeback: vi.fn(),
    rematch: vi.fn(),
    declineRematch: vi.fn(),
    ...overrides,
  } satisfies LichessRoundActionContext;
}

describe("dispatchLichessRoundAction", () => {
  it("forwards moves, resign, abort, and timeout claims", async () => {
    const context = actions();

    await expect(dispatchLichessRoundAction("move", { u: "e2e4" }, context)).resolves.toBe(true);
    await dispatchLichessRoundAction("resign", undefined, context);
    await dispatchLichessRoundAction("abort", undefined, context);
    await dispatchLichessRoundAction("flag", undefined, context);

    expect(context.submitMove).toHaveBeenCalledWith("e2e4");
    expect(context.resign).toHaveBeenCalledOnce();
    expect(context.abort).toHaveBeenCalledOnce();
    expect(context.claimTimeout).toHaveBeenCalledOnce();
  });

  it("offers a draw or accepts the opponent's existing offer", async () => {
    const offer = actions();
    await dispatchLichessRoundAction("draw-yes", undefined, offer);
    expect(offer.offerDraw).toHaveBeenCalledOnce();

    const accept = actions({ match: { drawOffered: "b" } });
    await dispatchLichessRoundAction("draw-yes", undefined, accept);
    expect(accept.respondToDraw).toHaveBeenCalledWith(true);
  });

  it("does not send draw offers from computer rounds", async () => {
    const context = actions({
      match: { drawOffered: null, computer: { level: 20 } },
    });

    await expect(dispatchLichessRoundAction("draw-yes", undefined, context)).resolves.toBe(true);
    await expect(dispatchLichessRoundAction("draw-no", undefined, context)).resolves.toBe(true);

    expect(context.offerDraw).not.toHaveBeenCalled();
    expect(context.respondToDraw).not.toHaveBeenCalled();
  });

  it("forwards takeback and rematch decisions", async () => {
    const context = actions();

    await dispatchLichessRoundAction("takeback-yes", undefined, context);
    await dispatchLichessRoundAction("takeback-no", undefined, context);
    await dispatchLichessRoundAction("rematch-yes", undefined, context);
    await dispatchLichessRoundAction("rematch-no", undefined, context);

    expect(context.takeback).toHaveBeenCalledOnce();
    expect(context.declineTakeback).toHaveBeenCalledOnce();
    expect(context.rematch).toHaveBeenCalledOnce();
    expect(context.declineRematch).toHaveBeenCalledOnce();
  });

  it("rejects malformed and unsupported socket actions", async () => {
    const context = actions();

    await expect(dispatchLichessRoundAction("move", { u: "bad" }, context)).resolves.toBe(false);
    await expect(dispatchLichessRoundAction("berserk", undefined, context)).resolves.toBe(false);
    expect(context.submitMove).not.toHaveBeenCalled();
  });
});
