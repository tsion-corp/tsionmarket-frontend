import type { ChessColor } from "@/features/casino/lib/api/types";

type ActionResult = Promise<unknown> | unknown;

export interface LichessRoundActionContext {
  match: { drawOffered: ChessColor | null; computer?: unknown } | null | undefined;
  you: ChessColor | null;
  submitMove(uci: string): ActionResult;
  resign(): ActionResult;
  abort(): ActionResult;
  offerDraw(): ActionResult;
  respondToDraw(accept: boolean): ActionResult;
  claimDraw(): ActionResult;
  claimTimeout(): ActionResult;
  takeback(): ActionResult;
  declineTakeback(): ActionResult;
  rematch(): ActionResult;
  declineRematch(): ActionResult;
}

type SocketPayload = {
  u?: unknown;
  role?: unknown;
  pos?: unknown;
};

const DROP_ROLE = {
  pawn: "P",
  knight: "N",
  bishop: "B",
  rook: "R",
  queen: "Q",
  king: "K",
} as const;

export async function dispatchLichessRoundAction(
  type: string,
  payload: SocketPayload | undefined,
  actions: LichessRoundActionContext
): Promise<boolean> {
  switch (type) {
    case "move":
      if (typeof payload?.u !== "string" || payload.u.length < 4) return false;
      await actions.submitMove(payload.u);
      return true;
    case "drop": {
      const role = typeof payload?.role === "string" ? payload.role : "";
      const pos = typeof payload?.pos === "string" ? payload.pos : "";
      const piece = DROP_ROLE[role as keyof typeof DROP_ROLE];
      if (!piece || !/^[a-h][1-8]$/u.test(pos)) return false;
      await actions.submitMove(`${piece}@${pos}`);
      return true;
    }
    case "resign":
      await actions.resign();
      return true;
    case "abort":
      await actions.abort();
      return true;
    case "draw-yes": {
      if (actions.match?.computer) return true;
      const offeredByOpponent =
        actions.match?.drawOffered != null && actions.match.drawOffered !== actions.you;
      await (offeredByOpponent ? actions.respondToDraw(true) : actions.offerDraw());
      return true;
    }
    case "draw-no":
      if (actions.match?.computer) return true;
      await actions.respondToDraw(false);
      return true;
    case "draw-claim":
      await actions.claimDraw();
      return true;
    case "flag":
      await actions.claimTimeout();
      return true;
    case "takeback-yes":
      await actions.takeback();
      return true;
    case "takeback-no":
      await actions.declineTakeback();
      return true;
    case "rematch-yes":
      await actions.rematch();
      return true;
    case "rematch-no":
      await actions.declineRematch();
      return true;
    default:
      return false;
  }
}
