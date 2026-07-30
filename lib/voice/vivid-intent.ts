import { isDepositChain, isNavTarget, type Intent } from "@/lib/voice/intent";

// Frames the Vivid backend (apps/ai) pushes over the /audio socket. Only the
// fields this client reads are typed; unknown extras are ignored. The backend
// contract lives in apps/ai/src/services/intent-router.ts.
export type VividFrame =
  | { type: "session"; data: { sessionId: string; authenticated: boolean } }
  | { type: "transcript"; text: string; isFinal: boolean }
  | { type: "navigate"; data: { speech?: string; page: string } }
  | { type: "deposit"; data: { speech?: string; chain: string; token?: string } }
  | {
      type: "confirm";
      data: {
        speech?: string;
        token: string;
        action: string;
        parameters: Record<string, string>;
        expiresAtMs?: number;
      };
    }
  | { type: "result"; data: { speech?: string; action?: string } }
  | { type: "clarify"; data: { speech?: string } }
  | { type: "reject"; data: { speech?: string } }
  | { type: "error"; data: { speech?: string } };

// A frame that ends a turn — the point at which the client acts. `transcript`
// and `session` are progress frames, not terminal.
export type TerminalFrame = Extract<
  VividFrame,
  { type: "navigate" | "deposit" | "confirm" | "result" | "clarify" | "reject" | "error" }
>;

export function isTerminalFrame(frame: VividFrame): frame is TerminalFrame {
  return (
    frame.type === "navigate" ||
    frame.type === "deposit" ||
    frame.type === "confirm" ||
    frame.type === "result" ||
    frame.type === "clarify" ||
    frame.type === "reject" ||
    frame.type === "error"
  );
}

// Maps a Vivid action id to the SectionId whose page hosts it, so a command
// (rwa.buy) can navigate the user to the right section and pre-fill there.
const ACTION_SECTION: Record<string, "rwa"> = {
  "rwa.buy": "rwa",
  "rwa.sell": "rwa",
};

// Turns a terminal Vivid frame into the app's typed Intent. The dispatcher in
// use-voice-command then acts on it — no frame internals leak past this bridge.
export function vividToIntent(frame: TerminalFrame): Intent {
  switch (frame.type) {
    case "navigate": {
      const page = frame.data.page;
      if (isNavTarget(page)) {
        return { action: "navigate", target: page };
      }
      return { action: "unknown", transcript: page };
    }

    case "deposit": {
      // Open Add Funds on the crypto screen with the chain (and token, when it
      // matches) pre-selected so the deposit address is shown. No money moves.
      if (isDepositChain(frame.data.chain)) {
        return {
          action: "deposit",
          prefill: { chain: frame.data.chain, token: frame.data.token },
        };
      }
      return { action: "unknown", transcript: frame.data.chain };
    }

    case "confirm": {
      // A money command: don't execute by voice. Navigate to the hosting
      // section with the trade staged so the user confirms it on the page.
      const section = ACTION_SECTION[frame.data.action];
      const mode = frame.data.action.endsWith(".sell") ? "sell" : "buy";
      const symbol = frame.data.parameters.asset;
      if (section && symbol) {
        return {
          action: "navigate",
          target: section,
          prefill: { symbol, amount: frame.data.parameters.amount, mode },
        };
      }
      // A command we can't route to a prefill surface yet: say it's coming.
      return { action: "unsupported", what: frame.data.action.replace(/\./g, " ") };
    }

    case "result":
      return { action: "speak", message: frame.data.speech ?? "Done." };

    case "clarify":
    case "reject":
    case "error":
      return {
        action: "speak",
        message: frame.data.speech ?? "Sorry, I couldn't do that.",
      };
  }
}
