"use client";

import { isUnconfigured } from "@/lib/api/envelope";
import { classifyLoadFailure, offersRetry } from "@/lib/load-failure";
import { useCircuit } from "@/lib/api/circuit-store";

// Shared async states for any screen backed by a gateway service. Real data
// means real failure modes, so every screen shows one of these rather than
// rendering an empty shell that looks like a working page with nothing in it.

export function AsyncLoading({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[52px] animate-pulse rounded-[14px] bg-white/6" />
      ))}
    </div>
  );
}

export function AsyncEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid place-items-center px-4 py-14 text-center text-[13px] font-normal text-white/45">
      {children}
    </div>
  );
}

interface AsyncErrorProps {
  error: unknown;
  // What the user was trying to see, e.g. "the lobby".
  subject: string;
  // Shown when the service is not switched on yet. Each feature explains its
  // own absence, since "not configured" means something different per service.
  unconfiguredDetail?: string;
  onRetry?: () => void;
}

/**
 * One panel could not load, said the way you would say it out loud.
 *
 * This used to print `error.message` under the heading, so a reader whose wifi
 * blinked was shown "Failed to fetch" or "HTTP 502" — text written for whoever
 * reads the logs. It named something they could not act on, in language that
 * makes a hiccup look like a broken product.
 *
 * Three states now, because they call for three different things:
 *
 *  · the server is unreachable — the connection bar is already announcing it
 *    and already retrying, so this panel says the calm half of that and offers
 *    no button of its own. Five panels each offering a retry during one outage
 *    is how a frustrated reader personally multiplies the load.
 *  · the service is not switched on — nothing to retry, ever.
 *  · something else failed — a plain sentence and a real Try again.
 *
 * No red. Red is for money: a trade that did not go through, a bet that was
 * rejected. A list that has not arrived has hurt nobody, and spending the
 * reader's alarm on it means they have learned to ignore red by the time it
 * matters.
 */
export function AsyncError({
  error,
  subject,
  unconfiguredDetail = "This goes live once the service is switched on.",
  onRetry,
}: AsyncErrorProps) {
  const circuit = useCircuit();
  const circuitOpen = circuit.state !== "closed";
  const kind = classifyLoadFailure(error, isUnconfigured(error));
  // The breaker is the more reliable witness: it has seen every request, not
  // just this one.
  const effective = circuitOpen && kind !== "unconfigured" ? "offline" : kind;

  const message =
    effective === "unconfigured"
      ? `${subject} isn't available yet.`
      : effective === "offline"
        ? `Waiting to reach the server.`
        : `Couldn't load ${subject}.`;

  const detail =
    effective === "unconfigured"
      ? unconfiguredDetail
      : effective === "offline"
        ? `${subject} will fill in by itself once the connection is back.`
        : "This one is on us — try again in a moment.";

  return (
    <div className="ws-inset grid place-items-center px-5 py-12 text-center">
      {/* The real message stays reachable for anyone debugging, and nowhere
          near the reader's eye. */}
      <div className="max-w-[42ch]" title={error instanceof Error ? error.message : undefined}>
        <div className="text-[14px] font-semibold text-white/85">{message}</div>
        <div className="mt-1.5 text-[12.5px] font-normal text-white/50">{detail}</div>
        {onRetry && offersRetry(effective, circuitOpen) ? (
          <button
            onClick={onRetry}
            className="mt-4 cursor-pointer rounded-full border border-white/15 px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
