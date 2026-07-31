"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "@/lib/toast";
import { copyText } from "@/lib/clipboard";
import { getWalletAddress } from "@/lib/user";
import { useAppNavigate } from "@/hooks/use-app-navigate";
import { useVoiceRecord } from "@/hooks/use-voice-record";
import { useVividSession, type VividSession } from "@/hooks/use-vivid-session";
import { useSpeech } from "@/hooks/use-speech";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useMoney } from "@/components/ui/currency-select";
import { useFx } from "@/hooks/use-fx";
import { findCurrency, formatMoney } from "@/lib/currencies";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { SECTION_LABEL } from "@/lib/sections";
import { depositToQuery, perpToQuery } from "@/lib/voice/prefill";
import { isTerminalFrame, vividToIntent, type VividFrame } from "@/lib/voice/vivid-intent";
import { matchWakeWord } from "@/lib/voice/wake-word";
import { vlog, vwarn } from "@/lib/voice/log";
import type { ChainType, Intent } from "@/lib/voice/intent";

const DEPOSIT_CHAIN_LABEL: Record<string, string> = {
  solana: "Solana",
  base: "Base",
  ethereum: "Ethereum",
};

const CHAIN_LABEL: Record<ChainType, string> = {
  ethereum: "Ethereum",
  solana: "Solana",
};

// How long the THINK phase waits for the backend's terminal frame before giving
// up the turn and relistening — so a dropped/missing frame can never hang the
// loop. The backend caps an utterance at 30s and the model at ~15s, so a healthy
// turn resolves well inside this.
const TURN_TIMEOUT_MS = 25_000;
// Sentinel distinguishing a timeout from a real (possibly null) answer.
const TURN_TIMEOUT = Symbol("turn-timeout");
// After this many consecutive turns that don't address Vivid (noise / echo /
// ambient talk), pause the session. A hard backstop so the loop can NEVER spin.
const MAX_UNADDRESSED = 6;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortenAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

// The phase of one conversational turn — a strict state machine so the mic and
// the voice never overlap (the ChatGPT/Claude model): we LISTEN, then THINK
// (waiting on the backend), then SPEAK the answer, and only THEN listen again.
export type TurnPhase = "idle" | "listening" | "thinking" | "speaking";

// One line of the on-screen conversation transcript, like ChatGPT/Claude voice.
export interface VoiceMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
}

interface UseVoiceSession {
  // Whether a hands-free session is currently open (mic looping).
  active: boolean;
  // Whether the mic is capturing this turn (for the pulsing UI).
  listening: boolean;
  // The current turn phase, for richer UI (listening / thinking / speaking).
  phase: TurnPhase;
  // The on-screen conversation so far: what you said, what Vivid replied.
  messages: VoiceMessage[];
  supported: boolean;
  configured: boolean;
  // Start ONE hands-free session: click once, then say "Vivid …" each turn.
  start: () => Promise<void>;
  // End the session (also happens on "Vivid, stop").
  stop: () => void;
}

/**
 * useVoiceSession (Steps 5 + 6) — the conversational loop. One click opens a
 * persistent session; from then on the mic auto-cycles:
 *
 *   listen (VAD auto-stop) → wake-word gate → send utterance → dispatch the
 *   streamed frames → speak the answer → relisten
 *
 * until the user says "Vivid, stop" or taps stop. Context persists across turns
 * server-side (one socket via useVividSession), so follow-ups resolve naturally.
 *
 * Wake-word gate (Step 6): each turn must ADDRESS Vivid. Because there is no
 * in-browser wake-word model, we gate on the backend's FINAL transcript: a turn
 * whose transcript doesn't start with "Vivid" is ignored (its frames are not
 * dispatched and nothing is spoken) and we simply relisten. This keeps ambient
 * conversation from firing actions while staying hands-free.
 */
export function useVoiceSession(): UseVoiceSession {
  const { user } = usePrivy();
  const router = useRouter();
  const navigate = useAppNavigate();
  const { supported, capture } = useVoiceRecord();
  const { configured, open } = useVividSession();
  const { speak } = useSpeech();
  const { totalUsd, refetch } = usePortfolio();
  const money = useMoney();
  const { rate } = useFx();
  const { hidden } = useBalanceVisibility();

  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<TurnPhase>("idle");
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const messageIdRef = useRef(0);

  // Append a line to the on-screen transcript.
  const addMessage = useCallback((role: "user" | "assistant", text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    messageIdRef.current += 1;
    setMessages((prev) => [...prev, { id: messageIdRef.current, role, text: trimmed }]);
  }, []);

  // Loop control + the live session handle, kept in refs so the async loop reads
  // current values without re-subscribing.
  const activeRef = useRef(false);
  const sessionRef = useRef<VividSession | null>(null);
  // The wake-word verdict for the CURRENT turn, decided when its `transcript`
  // frame arrives; gates whether the turn's later frames are dispatched.
  const turnAddressedRef = useRef(false);

  // The turn-completion latch. The loop, after sending an utterance, awaits this;
  // the frame handler resolves it with the text to SPEAK (or null when the turn
  // wasn't addressed to Vivid / produced no speech). This is what makes the loop
  // wait for the answer before it ever listens again — no overlap, no talking
  // over you, one turn at a time.
  // Armed only during a turn's THINK phase and detached the instant the turn
  // resolves (or times out), so a late frame from a superseded turn finds no
  // latch and is ignored — it can never resolve a future turn early (the race
  // behind the fast re-loop).
  const resolveTurnRef = useRef<((speech: string | null) => void) | null>(null);

  // Set the phase in both React state (UI) and keep `listening` derived from it.
  const setTurnPhase = useCallback((next: TurnPhase) => {
    setPhase(next);
  }, []);

  // Resolve the CURRENT turn's latch exactly once. Frames tagged with a stale
  // turn id (a late reply from a superseded turn) are ignored so they cannot
  // resolve a future turn early.
  const completeTurn = useCallback((speech: string | null) => {
    const resolve = resolveTurnRef.current;
    if (resolve) {
      resolveTurnRef.current = null;
      resolve(speech);
    }
  }, []);

  // End the session (also fired by "Vivid, stop"). Declared first so the loop and
  // frame handler can call it.
  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setTurnPhase("idle");
    // Release any loop awaiting a turn so it can exit cleanly.
    resolveTurnRef.current?.(null);
    resolveTurnRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
  }, [setTurnPhase]);

  // Perform a turn's UI side-effect (navigate / copy / refetch) and RETURN the
  // sentence to speak. It does NOT speak — the loop speaks and awaits it, so the
  // turn's phases stay strictly ordered (think → speak → listen).
  const dispatch = useCallback(
    (intent: Intent): string => {
      switch (intent.action) {
        case "navigate": {
          navigate(intent.target, intent.prefill);
          if (intent.prefill) {
            const { symbol, mode } = intent.prefill;
            return `Opening ${symbol} to ${mode}.`;
          }
          return `Opening ${SECTION_LABEL[intent.target]}.`;
        }

        case "deposit": {
          const { chain, token } = intent.prefill;
          const label = DEPOSIT_CHAIN_LABEL[chain] ?? chain;
          router.push(`/dashboard?${depositToQuery(intent.prefill)}`);
          return token
            ? `Here's your ${token} deposit address on ${label}.`
            : `Opening add funds on ${label}.`;
        }

        case "perp": {
          const { symbol, side, amount, leverage } = intent.prefill;
          const verb = side === "short" ? "Shorting" : "Longing";
          router.push(`/dashboard?${perpToQuery(intent.prefill)}#trade`);
          return `${verb} ${symbol} with ${amount} dollars at ${leverage} times leverage. Placing your order now.`;
        }

        case "speak":
          return intent.message;

        case "getBalance":
          return hidden
            ? "Your balances are hidden. Unhide them to check."
            : `Your total balance is ${money.format(totalUsd)}.`;

        case "getWalletAddress": {
          const address = getWalletAddress(user, intent.chain);
          const chainLabel = CHAIN_LABEL[intent.chain];
          if (!address) {
            return `I couldn't find a ${chainLabel} wallet on your account.`;
          }
          void copyText(address);
          toast.success(`${chainLabel}: ${shortenAddress(address)} (copied)`);
          return `I've copied your ${chainLabel} address to the clipboard.`;
        }

        case "refresh":
          void refetch();
          return "Refreshing your balances.";

        case "unsupported":
          return `${intent.what} by voice is coming soon.`;

        case "unknown":
          return "Sorry, I didn't catch that. Try asking for your balance, or to open markets.";
      }
    },
    [navigate, router, hidden, money, totalUsd, user, refetch]
  );

  // Handle every frame streamed on the session socket. The wake-word gate is
  // applied when the `transcript` frame arrives; subsequent action frames for a
  // turn that didn't address Vivid are dropped.
  // Handle each streamed frame. It NEVER speaks directly — a terminal frame
  // resolves the turn latch with the text to say, and the loop speaks it. This
  // is what serializes think → speak → listen.
  const onFrame = useCallback(
    (frame: VividFrame) => {
      vlog("frame", `◀ ${frame.type}`, "data" in frame ? frame.data : frame);
      if (frame.type === "session") return;

      if (frame.type === "transcript") {
        if (!frame.isFinal) return;
        // The session is already open (you tapped to start), so EVERY turn is for
        // Vivid — we do NOT require the wake word each turn (that was dropping real
        // commands like "what's my balance in Kenyan shillings"). The wake word is
        // now optional: if present we just strip it; we still honour a spoken
        // "stop"/"that's all" to end the session hands-free.
        const { matched, command } = matchWakeWord(frame.text);
        turnAddressedRef.current = true;
        vlog("wake-word", "session open → answering", {
          heard: frame.text,
          wakeWordPresent: matched,
        });
        // Show what the user said in the on-screen transcript (wake word stripped
        // if they used it, so the line reads as the actual request).
        addMessage("user", matched && command ? command : frame.text);
        // Natural ways to end the session hands-free. Kept specific so a normal
        // request ("stop the order") doesn't accidentally end it — it must be
        // about stopping the CONVERSATION.
        const endPhrase =
          /\b(stop (listening|talking|the conversation)|stop,? vivid|i'?m done|we'?re done|that'?s all|that is all|never ?mind|goodbye|go away|end (the )?(session|conversation))\b/i;
        if (endPhrase.test(command || frame.text)) {
          vlog("loop", "end phrase heard → ending session");
          completeTurn(null);
          stop();
        }
        return;
      }

      // Command lifecycle frames are informational — surface, don't end the turn.
      if (frame.type === "command_submitted") {
        toast.success("Order submitted.");
        return;
      }
      if (frame.type === "confirm_failed") {
        completeTurn("That confirmation didn't go through — please try again.");
        return;
      }

      // The app fulfills the balance itself (it has the real figure on the
      // client). Compute it, optionally convert to the requested currency using
      // the same FX the app uses, and hand the sentence to the loop to speak.
      if (frame.type === "balance") {
        if (hidden) {
          completeTurn("Your balances are hidden. Unhide them to check.");
          return;
        }
        const code = frame.data.currency?.toUpperCase();
        const currency = code ? findCurrency(code) : undefined;
        if (currency && currency.code !== "USD") {
          const fx = rate(currency.code);
          if (fx == null) {
            completeTurn(
              `Your total balance is ${money.format(totalUsd)}. I couldn't get a live ${currency.name} rate right now.`
            );
          } else {
            completeTurn(
              `Your total balance is ${formatMoney(totalUsd, currency, fx)} — that's ${money.format(totalUsd)}.`
            );
          }
        } else {
          completeTurn(`Your total balance is ${money.format(totalUsd)}.`);
        }
        return;
      }

      if (!isTerminalFrame(frame)) return;

      // A turn that didn't address Vivid produces no answer: complete it silently
      // so the loop just relistens (no speech, no action).
      if (!turnAddressedRef.current) {
        vlog("frame", `dropped ${frame.type} — turn not addressed to Vivid`);
        completeTurn(null);
        return;
      }

      // Addressed to Vivid: run the side-effect and hand the loop the sentence to
      // speak. The loop awaits speech before it listens again.
      const intent = vividToIntent(frame);
      vlog("dispatch", `→ ${intent.action}`, intent);
      const speech = dispatch(intent);
      completeTurn(speech);
    },
    [dispatch, completeTurn, stop, hidden, rate, money, totalUsd, addMessage]
  );

  // The turn state machine — the heart of the ChatGPT/Claude-style loop. Each
  // iteration runs ONE turn to completion, phases strictly serialized so the mic
  // and the voice never overlap:
  //
  //   LISTEN (VAD auto-stop, waits for you to finish)
  //     → THINK (send + await the backend's terminal frame)
  //       → SPEAK the answer to completion
  //         → back to LISTEN
  //
  // A turn that isn't addressed to Vivid, or says nothing, skips the speak phase
  // and just relistens. Because we AWAIT the answer and AWAIT the speech before
  // listening again, Vivid never answers a half-sentence and never talks over
  // itself or over your next utterance.
  const runLoop = useCallback(async () => {
    let turn = 0;
    // Guard against a tight spin when nothing is being said (silence/noise):
    // after several empty captures in a row, back off longer between listens.
    let emptyStreak = 0;
    // Consecutive turns that produced no addressed answer — the backstop counter.
    let unaddressedStreak = 0;

    while (activeRef.current) {
      const session = sessionRef.current;
      if (!session) break;

      turn += 1;

      // ── LISTEN ──────────────────────────────────────────────────────────
      let outcome: Awaited<ReturnType<typeof capture>>;
      try {
        vlog("loop", `turn ${turn}: LISTENING…`);
        setTurnPhase("listening");
        outcome = await capture();
      } catch (err) {
        vwarn("loop", "capture failed", err);
        break;
      }
      if (!activeRef.current) break;

      if (!outcome.blob) {
        // No speech captured. Never re-enter capture with zero delay — that is
        // the tight-loop trap. Pause briefly (longer as the silence persists) so
        // an idle session sits quietly instead of spinning.
        emptyStreak += 1;
        const backoff = Math.min(250 * emptyStreak, 1500);
        vlog("loop", `turn ${turn}: no audio (${outcome.reason}) → wait ${backoff}ms & relisten`);
        await delay(backoff);
        continue;
      }
      emptyStreak = 0;

      // ── THINK ───────────────────────────────────────────────────────────
      // Arm the turn latch BEFORE sending, so a fast terminal frame can't race
      // ahead of us. Then send and await the answer — but never wait forever:
      // if no terminal frame arrives within the timeout, give up this turn and
      // relisten rather than hanging the loop.
      turnAddressedRef.current = false;
      const answered = new Promise<string | null>((resolve) => {
        resolveTurnRef.current = resolve;
      });
      try {
        vlog("loop", `turn ${turn}: sending → THINKING`, { bytes: outcome.blob.size });
        setTurnPhase("thinking");
        await session.sendUtterance(outcome.blob);
      } catch (err) {
        vwarn("loop", "send failed", err);
        break;
      }

      const result = await Promise.race<string | null | typeof TURN_TIMEOUT>([
        answered,
        delay(TURN_TIMEOUT_MS).then(() => TURN_TIMEOUT),
      ]);
      // Detach the latch so a late frame from THIS turn can't resolve a FUTURE one.
      resolveTurnRef.current = null;
      if (!activeRef.current) break;

      if (result === TURN_TIMEOUT) {
        vwarn("loop", `turn ${turn}: no answer within ${TURN_TIMEOUT_MS}ms → relistening`);
        await delay(300);
        continue;
      }
      const speech: string | null = result;

      // ── SPEAK ───────────────────────────────────────────────────────────
      if (speech) {
        vlog("loop", `turn ${turn}: SPEAKING`, { text: speech.slice(0, 60) });
        // Show Vivid's reply in the on-screen transcript, then speak it.
        addMessage("assistant", speech);
        setTurnPhase("speaking");
        await speak(speech);
        unaddressedStreak = 0;
        // After speaking, wait for the mic's echo canceller to settle before
        // reopening — otherwise the tail of Vivid's own voice can be captured.
        await delay(400);
      } else {
        // The turn wasn't addressed to Vivid (or produced nothing). If this keeps
        // happening it's noise/echo, not a real conversation — after a run of
        // them, pause the session so it can NEVER spin indefinitely.
        unaddressedStreak += 1;
        vlog("loop", `turn ${turn}: unaddressed (${unaddressedStreak}) → relistening`);
        if (unaddressedStreak >= MAX_UNADDRESSED) {
          vwarn("loop", "too many unaddressed turns → pausing session");
          await speak("I'll pause for now. Tap the mic when you'd like to talk again.");
          break;
        }
        await delay(150);
      }
    }
    vlog("loop", "loop exited");
    if (activeRef.current) stop();
  }, [capture, speak, setTurnPhase, stop, addMessage]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    if (!configured) {
      vwarn("session", "not configured — NEXT_PUBLIC_AI_WS_URL missing");
      toast.error("Voice is not configured.");
      return;
    }
    vlog("session", "opening socket…");
    let session: VividSession;
    try {
      session = await open(onFrame);
      vlog("session", "socket open ✓");
    } catch (err) {
      vwarn("session", "open failed", err);
      toast.error("Couldn't start voice. Please try again.");
      return;
    }
    sessionRef.current = session;
    activeRef.current = true;
    setActive(true);
    setMessages([]); // fresh transcript for a new conversation
    // Speak the greeting to COMPLETION before the loop opens the mic — otherwise
    // the first capture would record Vivid's own greeting (the overlap bug).
    setTurnPhase("speaking");
    await speak("Hi, my name is Vivid. How can I help you today?");
    if (!activeRef.current) return; // stopped during the greeting
    void runLoop();
  }, [configured, open, onFrame, runLoop, speak, setTurnPhase]);

  // `listening` stays true only while the mic is actually capturing, so existing
  // UI keyed on it (the pulsing avatar) behaves as before; `phase` gives finer
  // states for anything that wants to show thinking/speaking too.
  return {
    active,
    listening: phase === "listening",
    phase,
    messages,
    supported,
    configured,
    start,
    stop,
  };
}
