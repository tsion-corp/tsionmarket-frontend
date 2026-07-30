"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMatchmakingTicket } from "@/hooks/use-casino-chess";
import { CasinoError, CasinoLoading } from "@/components/dashboard/casino/casino-state";
import { toast } from "@/lib/toast";

export function MatchmakingSection({ ticketId }: { ticketId: string | null }) {
  const router = useRouter();
  const { ticket, isLoading, error, cancel } = useMatchmakingTicket(ticketId);

  // The server pairs players, so the client just follows the ticket into the
  // match it names.
  useEffect(() => {
    if (ticket?.state === "matched" && ticket.matchId) {
      router.push(`/casino/chess/play?match=${ticket.matchId}`);
    }
  }, [ticket, router]);

  // Reached by opening this page directly, or after a search ended. There is
  // nothing to show without one, so send the player back to where a search
  // actually starts rather than leaving them on an empty screen.
  if (!ticketId) {
    return (
      <div className="mx-auto w-full max-w-[520px] px-4 pt-10 pb-20 sm:px-6">
        <div className="ws-glass rounded-2xl p-9 text-center">
          <div className="ws-display mb-1.5 text-[19px]">No game waiting</div>
          <div className="mb-5 text-[12.5px] font-normal text-white/55">
            Start a quick match from the lobby and we&apos;ll sit you down against whoever is
            around.
          </div>
          <Link
            href="/casino/chess"
            className="text-ink inline-block cursor-pointer rounded-full bg-white px-5 py-2.5 font-sans text-[13px] font-bold"
          >
            Back to the lobby
          </Link>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[520px] px-4 pt-10 pb-20">
        <CasinoError error={error} subject="matchmaking" />
      </div>
    );
  }
  if (isLoading || !ticket) {
    return (
      <div className="mx-auto w-full max-w-[520px] px-4 pt-10 pb-20">
        <CasinoLoading label="Joining the queue" rows={3} />
      </div>
    );
  }

  const onCancel = async () => {
    try {
      await cancel();
      toast.success("Game closed.");
      router.push("/casino/chess");
    } catch {
      toast.error("Couldn't close that game.");
    }
  };

  if (ticket.state === "expired") {
    return (
      <div className="mx-auto w-full max-w-[520px] px-4 pt-10 pb-20">
        <div className="ws-glass rounded-2xl p-9 text-center">
          <div className="ws-display mb-1.5 text-[19px]">That game is no longer open</div>
          <div className="text-[12.5px] font-normal text-white/55">
            It was closed before anyone joined. Start another, or create an invite link instead.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 pt-10 pb-20 sm:px-6">
      <div className="ws-glass rounded-2xl p-9 text-center">
        <div className="border-accent/30 border-t-accent mx-auto mb-5 h-11 w-11 animate-spin rounded-full border-2" />
        <div className="ws-display mb-1.5 text-[19px]">Waiting for an opponent</div>
        <div className="mb-4.5 text-[12.5px] font-normal text-white/55">
          Your game is open in the lobby. It starts the moment somebody takes the other side.
        </div>
        <div className="mb-5 text-[11.5px] font-normal text-white/40">
          You can leave this page. The game stays open until you close it.
        </div>
        <button
          onClick={() => void onCancel()}
          className="cursor-pointer rounded-full border border-white/15 px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
        >
          Close game
        </button>
      </div>
    </div>
  );
}
