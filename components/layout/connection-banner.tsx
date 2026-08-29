"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { retryCircuitNow, useCircuit } from "@/lib/api/circuit-store";

/**
 * One honest sentence when the server is unreachable.
 *
 * The alternative — which is what this app did — is every screen discovering
 * the outage on its own: a board that stops updating, a balance that never
 * arrives, a chart stuck on its skeleton, none of them saying why. Silence
 * reads as "this app is broken"; forty error cards read the same way and are
 * louder. So the panels keep whatever they have and go quiet, and this speaks
 * for all of them, once.
 *
 * It says the three things a player actually needs: what is wrong, that we are
 * retrying without them, and when — plus a way to force it now, because
 * somebody who has just walked back into wifi should not have to sit out a
 * cooldown that exists for a different reason.
 *
 * Only while the circuit is OPEN, never on one failed request: a bar that
 * flickers on every dropped packet teaches people to ignore it, which is worse
 * than not having one.
 */
export function ConnectionBanner() {
  const circuit = useCircuit();
  const queryClient = useQueryClient();
  const t = useTranslations("connection");
  const [now, setNow] = useState(() => Date.now());
  const down = circuit.state !== "closed";

  // The countdown only ticks while there is one. Nothing runs in the normal
  // case, which is the point of a component about restraint.
  useEffect(() => {
    if (!down) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [down]);

  if (!down) return null;

  const seconds = Math.max(0, Math.ceil((circuit.retryAt - now) / 1000));
  const probing = circuit.state === "half-open" || seconds === 0;

  return (
    <div
      // `polite`: a status, not an alarm. A screen reader finishes its
      // sentence before it mentions this.
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] z-[95] mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-full border border-white/12 bg-[#141416]/92 px-4 py-2.5 shadow-[0_18px_50px_-16px_rgba(0,0,0,0.95)] backdrop-blur-[18px] md:bottom-6"
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${probing ? "bg-accent animate-pulse" : "bg-down"}`}
      />
      <p className="font-sans text-[13px] leading-4 text-white/75">
        {probing ? (
          t("reconnecting")
        ) : (
          <>
            <span className="font-medium text-white">{t("offline")}</span>{" "}
            <span className="tnum text-white/55">{t("retryIn", { seconds })}</span>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => {
          // Both halves, or the button appears to do nothing until the next
          // poll: drop the cooldown, then actually re-ask.
          retryCircuitNow();
          void queryClient.refetchQueries({ type: "active" });
        }}
        className="shrink-0 cursor-pointer rounded-full bg-white/10 px-3 py-1 font-sans text-[12px] font-medium text-white transition-colors hover:bg-white/16"
      >
        {t("retryNow")}
      </button>
    </div>
  );
}
