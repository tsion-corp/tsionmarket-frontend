"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "@/lib/toast";
import { copyText } from "@/lib/clipboard";
import { getWalletAddress } from "@/lib/user";
import { useAppNavigate } from "@/hooks/use-app-navigate";
import { useVoiceRecord } from "@/hooks/use-voice-record";
import { useVividSocket } from "@/hooks/use-vivid-socket";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useMoney } from "@/components/ui/currency-select";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { SECTION_LABEL } from "@/lib/sections";
import { vividToIntent } from "@/lib/voice/vivid-intent";
import { depositToQuery } from "@/lib/voice/prefill";
import type { ChainType, Intent } from "@/lib/voice/intent";

// How each deposit chain reads in a toast.
const DEPOSIT_CHAIN_LABEL: Record<string, string> = {
  solana: "Solana",
  base: "Base",
  ethereum: "Ethereum",
};

interface UseVoiceCommand {
  recording: boolean;
  busy: boolean;
  supported: boolean;
  // One tap runs the whole flow: listen, auto-stop on pause, understand, act.
  run: () => Promise<void>;
}

const CHAIN_LABEL: Record<ChainType, string> = {
  ethereum: "Ethereum",
  solana: "Solana",
};

// Shortens an address for a toast so it stays readable while still confirming
// which wallet was returned. The full value is copied to the clipboard.
function shortenAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function capitalize(text: string): string {
  return text.length ? text[0].toUpperCase() + text.slice(1) : text;
}

// Ties the whole spoken-command flow together in a single call: capture one
// utterance (the mic auto-stops when the speaker pauses) -> stream it to the
// Vivid backend over the /audio socket -> dispatch the returned intent. Uses one
// toast that starts as a spinner and resolves in place to success or error, so a
// command reads as a single "listening -> done" notification, matching how the
// app reports every other async action.
export function useVoiceCommand(): UseVoiceCommand {
  const { user } = usePrivy();
  const router = useRouter();
  const navigate = useAppNavigate();
  const { recording, supported, capture } = useVoiceRecord();
  const { configured, send } = useVividSocket();
  const { totalUsd, refetch } = usePortfolio();
  const money = useMoney();
  const { hidden } = useBalanceVisibility();
  const [busy, setBusy] = useState(false);

  const dispatch = useCallback(
    (intent: Intent, toastId: string | number) => {
      switch (intent.action) {
        case "navigate":
          // A spoken buy/sell arrives as navigate + prefill: open the section
          // with the trade staged so the user confirms it on the page (we never
          // auto-execute money actions by voice).
          if (intent.prefill) {
            const { symbol, mode } = intent.prefill;
            toast.success(`Opening ${symbol} to ${mode}`, { id: toastId });
          } else {
            toast.success(`Opening ${SECTION_LABEL[intent.target]}`, { id: toastId });
          }
          navigate(intent.target, intent.prefill);
          return;

        case "deposit": {
          // Open Add Funds on the crypto screen with the chain (and token, when
          // it matches) pre-selected, so the deposit address is shown. The
          // dashboard reads these params and opens the funds modal.
          const { chain, token } = intent.prefill;
          const label = DEPOSIT_CHAIN_LABEL[chain] ?? chain;
          toast.success(token ? `Add ${token} on ${label}` : `Add funds on ${label}`, {
            id: toastId,
          });
          router.push(`/dashboard?${depositToQuery(intent.prefill)}`);
          return;
        }

        case "speak":
          // A spoken read result (price, list) or a clarify/reject message.
          toast.success(intent.message, { id: toastId });
          return;

        case "getBalance":
          // Respect the app-wide hide-balances toggle: don't read a hidden
          // number out loud in a toast.
          if (hidden) {
            toast.info("Balances are hidden. Unhide them to check.", { id: toastId });
          } else {
            toast.success(`Your balance is ${money.format(totalUsd)}`, { id: toastId });
          }
          return;

        case "getWalletAddress": {
          const address = getWalletAddress(user, intent.chain);
          if (!address) {
            toast.error(`No ${CHAIN_LABEL[intent.chain]} wallet found.`, { id: toastId });
            return;
          }
          // Copy so the user can paste it straight away; show a shortened form.
          void copyText(address);
          toast.success(`${CHAIN_LABEL[intent.chain]}: ${shortenAddress(address)} (copied)`, {
            id: toastId,
          });
          return;
        }

        case "refresh":
          toast.success("Refreshing balances", { id: toastId });
          void refetch();
          return;

        case "unsupported":
          // Understood, but this action isn't voice-enabled yet. Say so plainly
          // rather than pretending we didn't understand.
          toast.info(`${capitalize(intent.what)} by voice is coming soon.`, { id: toastId });
          return;

        case "unknown": {
          const heard = intent.transcript ? `Heard "${intent.transcript}"` : "Didn't catch that";
          toast.error(`${heard}. Try "what's my balance" or "go to markets".`, { id: toastId });
          return;
        }
      }
    },
    [navigate, router, hidden, money, totalUsd, user, refetch]
  );

  const run = useCallback(async () => {
    if (busy || recording) return;

    const toastId = toast.loading("Listening…");
    let audio: Blob | null = null;
    try {
      const result = await capture();
      audio = result.blob;
    } catch (err) {
      console.error("[voice] capture failed:", err);
      toast.error("Microphone unavailable.", { id: toastId });
      return;
    }

    if (!audio) {
      toast.error("Didn't hear anything. Try again.", { id: toastId });
      return;
    }

    if (!configured) {
      toast.error("Voice is not configured.", { id: toastId });
      return;
    }

    setBusy(true);
    toast.loading("Working…", { id: toastId });
    try {
      // Stream the clip to Vivid over the /audio socket. The hook authenticates
      // with the Privy access token, sends the audio + endpoint frame, and
      // resolves with the terminal frame for this turn.
      const { frame } = await send(audio);
      const intent = vividToIntent(frame);
      console.log("[voice] dispatching intent:", intent.action, JSON.stringify(intent));
      dispatch(intent, toastId);
    } catch (err) {
      console.error("[voice] turn failed:", err);
      toast.error("Voice is unavailable right now.", { id: toastId });
    } finally {
      setBusy(false);
    }
  }, [busy, recording, capture, configured, send, dispatch]);

  return { recording, busy, supported, run };
}
