"use client";

// The "go live" control on the match view. Only a participant sees it, and
// each player broadcasts their own stream, so both players can be live on the
// same match at once.
//
// The round view keeps a mobile column and a desktop rail in the DOM at the
// same time and hides one with CSS, so the panel is rendered twice. One
// broadcast must not become two LiveKit rooms, so the state lives in a
// provider that is mounted once and both copies read it.
//
// Composition note: the screen share and the camera go up as two separate
// LiveKit tracks rather than one composited frame. Compositing here would mean
// drawing both into a canvas and publishing that, which costs a frame copy per
// tick and freezes the layout at the source. Publishing both and letting the
// Market Square viewer draw the camera over the screen is the picture-in-
// picture convention Twitch and chess.com streamers use, and it leaves the
// layout the viewer's to change. The viewer tells them apart by track source.

import { createContext, useContext, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import {
  useChessBroadcast,
  type ChessBroadcastActions,
  type ChessBroadcastState,
} from "@/features/casino/hooks/use-chess-broadcast";
import {
  CHESS_CARD_BG,
  CHESS_CARD_SHADOW,
  CHESS_PRIMARY_BUTTON_CLASS,
  CHESS_SECONDARY_BUTTON_CLASS,
} from "@/features/casino/lib/chess/ui";

const buttonSize = "px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap";

type Broadcast = ChessBroadcastState & ChessBroadcastActions;

const BroadcastContext = createContext<Broadcast | null>(null);

export function ChessBroadcastProvider({
  matchId,
  whiteName,
  blackName,
  children,
}: {
  matchId: string | null;
  whiteName: string;
  blackName: string;
  children: React.ReactNode;
}) {
  const broadcast = useChessBroadcast(matchId, whiteName, blackName);
  return <BroadcastContext.Provider value={broadcast}>{children}</BroadcastContext.Provider>;
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="bg-down inline-block h-1.5 w-1.5 rounded-full" />
      <span className="text-down text-[11px] font-semibold tracking-[0.08em]">LIVE</span>
    </span>
  );
}

export function GoLivePanel({ matchOver }: { matchOver: boolean }) {
  const broadcast = useContext(BroadcastContext);
  const [confirming, setConfirming] = useState(false);

  if (!broadcast) return null;
  const { phase } = broadcast;
  const publishing = phase === "live" || phase === "share-stopped" || phase === "starting";

  // The hook owns the call and the error state. This only reports the outcome.
  const onApply = async () => {
    try {
      await broadcast.applyForCreatorRole();
      toast.success("Creator application sent. Market Square reviews it.");
    } catch {
      toast.error("Could not send the application.");
    }
  };

  return (
    <div
      className="mt-3 rounded-[16px] border border-white/6 px-4 py-3.5"
      style={{ background: CHESS_CARD_BG, boxShadow: CHESS_CARD_SHADOW }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-white/48">Broadcast to Market Square</span>
        {phase === "live" && broadcast.sharingScreen ? <LiveDot /> : null}
      </div>

      {broadcast.supported === false ? (
        <p className="mt-2 text-[11.5px] leading-[1.55] text-white/52">
          This browser cannot share a screen. Screen capture is desktop only, so open the match in a
          desktop browser to broadcast.
        </p>
      ) : broadcast.roleUnavailable ? (
        <div className="mt-2">
          <p className="text-[11.5px] leading-[1.55] text-white/52">
            Market Square did not answer, so we cannot tell whether this account can broadcast.
          </p>
          <button
            onClick={() => void broadcast.recheckRole()}
            className={`${CHESS_SECONDARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
          >
            Try again
          </button>
        </div>
      ) : broadcast.supported === null || broadcast.isCreator === null ? (
        <p className="mt-2 text-[11.5px] text-white/52">Checking whether you can broadcast…</p>
      ) : phase === "not-creator" ? (
        <div className="mt-2">
          <p className="text-[11.5px] leading-[1.55] text-white/52">
            Only creator accounts can start a Market Square stream, and yours is not one yet. Apply
            for the creator role and you can broadcast once it is approved.
          </p>
          <button
            onClick={() => void onApply()}
            disabled={broadcast.applying}
            className={`${CHESS_SECONDARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
          >
            {broadcast.applying ? "…" : "Apply to be a creator"}
          </button>
        </div>
      ) : (
        <>
          {phase === "idle" || phase === "ended" || phase === "error" ? (
            <>
              <p className="mt-2 text-[11.5px] leading-[1.55] text-white/52">
                Share the board as a live stream on Market Square. Anyone can watch it there, and
                the description links back to this match.
              </p>
              <button
                onClick={() => setConfirming(true)}
                disabled={broadcast.busy}
                className={`${CHESS_PRIMARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
              >
                {phase === "ended" ? "Go live again" : "Go live"}
              </button>
            </>
          ) : null}

          {phase === "starting" ? (
            <p className="mt-2 text-[11.5px] text-white/52">Starting the broadcast…</p>
          ) : null}

          {phase === "share-stopped" ? (
            <div className="mt-2">
              <p className="border-down/30 text-down rounded-[10px] border px-3 py-2 text-[11.5px] leading-[1.5]">
                You stopped sharing your screen, so nothing is going out. Your browser will not let
                the page restart capture on its own.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  onClick={() => void broadcast.resumeScreenShare()}
                  disabled={broadcast.busy}
                  className={`${CHESS_PRIMARY_BUTTON_CLASS} ${buttonSize}`}
                >
                  {broadcast.busy ? "…" : "Share the board again"}
                </button>
                <button
                  onClick={() => void broadcast.stop()}
                  disabled={broadcast.busy}
                  className={`${CHESS_SECONDARY_BUTTON_CLASS} ${buttonSize}`}
                >
                  End broadcast
                </button>
              </div>
            </div>
          ) : null}

          {phase === "live" ? (
            <div className="mt-2">
              <p className="text-[11.5px] leading-[1.55] text-white/58">
                Sharing {broadcast.surface ?? "the surface you picked"}. Everything visible on it is
                going out live.
              </p>
              <label className="mt-2.5 flex cursor-pointer items-center justify-between gap-3">
                <span className="text-[11.5px] text-white/58">
                  Camera {broadcast.sharingCamera ? "on" : "off"}
                </span>
                <Switch
                  checked={broadcast.sharingCamera}
                  disabled={broadcast.busy}
                  onCheckedChange={(next: boolean) => void broadcast.setCameraEnabled(next)}
                />
              </label>
              {matchOver ? (
                <p className="mt-2.5 rounded-[10px] bg-black/20 px-3 py-2 text-[11.5px] leading-[1.5] text-white/70">
                  The match is over. End the broadcast so you are not streaming a finished board.
                </p>
              ) : null}
              <button
                onClick={() => void broadcast.stop()}
                disabled={broadcast.busy}
                className={`${CHESS_SECONDARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
              >
                {broadcast.busy ? "…" : "End broadcast"}
              </button>
            </div>
          ) : null}

          {phase === "end-failed" ? (
            <div className="mt-2">
              <p className="text-[11.5px] leading-[1.55] text-white/58">
                Nothing is going out from this page any more. Market Square has not confirmed the
                stream ended, so it may still show as live there until the service reaps it.
              </p>
              <button
                onClick={() => void broadcast.stop()}
                disabled={broadcast.busy}
                className={`${CHESS_PRIMARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
              >
                {broadcast.busy ? "…" : "Try ending again"}
              </button>
            </div>
          ) : null}

          {phase === "ending" ? (
            <p className="mt-2 text-[11.5px] text-white/52">Ending the broadcast…</p>
          ) : null}

          {phase === "ended" ? (
            <p className="mt-2 text-[11.5px] text-white/52">
              The stream has ended on Market Square.
            </p>
          ) : null}

          {broadcast.error ? (
            <div className="border-down/30 mt-2.5 rounded-[10px] border px-3 py-2">
              <p className="text-down text-[11.5px] leading-[1.5]">{broadcast.error}</p>
              {/* Secondary to the failure above, never a replacement for it. */}
              {broadcast.cleanupWarning ? (
                <p className="mt-1.5 text-[11.5px] leading-[1.5] text-white/58">
                  {broadcast.cleanupWarning}
                </p>
              ) : null}
              <button
                onClick={broadcast.dismissError}
                className="mt-1.5 cursor-pointer text-[11px] text-white/52 hover:text-white/80"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {publishing ? (
            <p className="mt-2.5 text-[10.5px] leading-[1.5] text-white/38">
              Viewer numbers are not shown here. Market Square is where the stream and its audience
              appear.
            </p>
          ) : null}
        </>
      )}

      {confirming ? (
        <ConfirmDialog
          title="Before you share your screen"
          rows={[
            { label: "What goes out", value: "The surface you pick" },
            { label: "Where", value: "Market Square, public" },
            { label: "Camera", value: "Off until you turn it on" },
          ]}
          warning="A screen share broadcasts everything visible on the surface you choose, including notifications and other tabs. Pick the single tab holding the board, not your whole screen. Your browser asks you next, and you can stop at any time."
          cancelLabel="Cancel"
          continueLabel="Pick a surface"
          onCancel={() => setConfirming(false)}
          onContinue={() => {
            setConfirming(false);
            // Called straight out of this click so the screen picker still has
            // the transient activation it requires.
            void broadcast.start();
          }}
        />
      ) : null}
    </div>
  );
}
