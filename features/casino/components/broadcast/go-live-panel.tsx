"use client";

// The "go live" control for any casino activity. Nothing here knows which
// game it is attached to: the caller owns the broadcast (so it can decide who
// is allowed to start one) and passes it in, along with the two sentences that
// have to name what is being shared.
//
// The panel reads the broadcast out of context rather than taking it as a
// prop, because a layout may render the panel more than once. The chess round
// view keeps a mobile column and a desktop rail in the DOM at the same time
// and hides one with CSS, so the panel appears twice. One broadcast must not
// become two LiveKit rooms, so the provider is mounted once above both.
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
  useGameBroadcast,
  type GameBroadcastActions,
  type GameBroadcastState,
  type GameBroadcastTarget,
} from "@/features/casino/hooks/use-game-broadcast";
import { broadcastLabel } from "@/lib/broadcast/broadcast";
import {
  CASINO_CARD_BG,
  CASINO_CARD_SHADOW,
  CASINO_PRIMARY_BUTTON_CLASS,
  CASINO_SECONDARY_BUTTON_CLASS,
} from "@/features/casino/lib/surface";

const buttonSize = "px-3.5 py-1.5 font-sans text-[11.5px] font-semibold whitespace-nowrap";

export type Broadcast = GameBroadcastState & GameBroadcastActions;

/** The two places the panel has to name the thing being broadcast. */
export interface BroadcastCopy {
  /**
   * What the viewer sees, as it reads mid-sentence: "Share the board as a live
   * stream", "Share the board again".
   */
  subject: string;
  /** Shown while live once the activity itself has finished. */
  finishedNotice: string;
}

interface BroadcastContextValue {
  broadcast: Broadcast;
  copy: BroadcastCopy;
}

const BroadcastContext = createContext<BroadcastContextValue | null>(null);

export function GameBroadcastProvider({
  broadcast,
  copy,
  children,
}: {
  broadcast: Broadcast;
  copy: BroadcastCopy;
  children: React.ReactNode;
}) {
  return (
    <BroadcastContext.Provider value={{ broadcast, copy }}>{children}</BroadcastContext.Provider>
  );
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="bg-down inline-block h-1.5 w-1.5 rounded-full" />
      <span className="text-down text-[11px] font-semibold tracking-[0.08em]">LIVE</span>
    </span>
  );
}

function speakerName(entry: {
  profile: { displayName: string | null; username: string | null } | null;
}): string {
  return entry.profile?.displayName ?? entry.profile?.username ?? "Someone";
}

/**
 * The host's inline moderation. This is the half that makes co-broadcasting
 * usable: an opponent's request has to be answerable from the game, because a
 * host who has to open Market Square to approve it will not do it mid-match.
 */
function SpeakerRequests({ broadcast }: { broadcast: Broadcast }) {
  if (broadcast.pendingSpeakers.length === 0) return null;
  return (
    <div className="border-accent/25 mt-2.5 rounded-[10px] border bg-black/20 px-3 py-2.5">
      {broadcast.pendingSpeakers.map((entry) => {
        const working = broadcast.resolving.includes(entry.id);
        return (
          <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
            <span className="text-[11.5px] leading-[1.5] text-white/80">
              {speakerName(entry)} wants to join your broadcast
            </span>
            <span className="flex gap-2">
              <button
                onClick={() => void broadcast.approveSpeaker(entry.id)}
                disabled={working}
                className={`${CASINO_PRIMARY_BUTTON_CLASS} ${buttonSize}`}
              >
                {working ? "…" : "Approve"}
              </button>
              <button
                onClick={() => void broadcast.declineSpeaker(entry.id)}
                disabled={working}
                className={`${CASINO_SECONDARY_BUTTON_CLASS} ${buttonSize}`}
              >
                Decline
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Somebody is already broadcasting this activity. Joining them is the point:
 * one broadcast with both faces beats two rival streams of the same board.
 *
 * More than one live stream for the same activity is legitimate (two people
 * can both be streaming the same ArkBall draw), so the choice is presented
 * rather than made here.
 */
function JoinExisting({ broadcast }: { broadcast: Broadcast }) {
  const many = broadcast.joinable.length > 1;
  return (
    <div className="mt-2">
      <p className="text-[11.5px] leading-[1.55] text-white/52">
        {many
          ? "These broadcasts of this game are already live. Join one and you appear in it, instead of starting a stream of your own."
          : "This game is already being broadcast. Join it and you appear in the same stream, instead of starting a second one."}
      </p>
      <div className="mt-2.5 flex flex-col gap-2">
        {broadcast.joinable.map((candidate) => (
          <button
            key={candidate.id}
            onClick={() => void broadcast.join(candidate.id)}
            disabled={broadcast.busy}
            className={`${CASINO_PRIMARY_BUTTON_CLASS} ${buttonSize} text-left`}
          >
            {broadcast.busy ? "…" : `Join ${broadcastLabel(candidate)}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GoLivePanel({ activityOver = false }: { activityOver?: boolean }) {
  const context = useContext(BroadcastContext);
  const [confirming, setConfirming] = useState(false);

  if (!context) return null;
  const { broadcast, copy } = context;
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
      style={{ background: CASINO_CARD_BG, boxShadow: CASINO_CARD_SHADOW }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-white/48">Broadcast to Market Square</span>
        {/* A guest publishes a camera, not a screen, so either track counts. */}
        {phase === "live" && (broadcast.sharingScreen || broadcast.sharingCamera) ? (
          <LiveDot />
        ) : null}
      </div>

      {broadcast.supported === false ? (
        <p className="mt-2 text-[11.5px] leading-[1.55] text-white/52">
          This browser cannot share a screen. Screen capture is desktop only, so open this page in a
          desktop browser to broadcast.
        </p>
      ) : broadcast.roleUnavailable ? (
        <div className="mt-2">
          <p className="text-[11.5px] leading-[1.55] text-white/52">
            Market Square did not answer, so we cannot tell whether this account can broadcast.
          </p>
          <button
            onClick={() => void broadcast.recheckRole()}
            className={`${CASINO_SECONDARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
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
            className={`${CASINO_SECONDARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
          >
            {broadcast.applying ? "…" : "Apply to be a creator"}
          </button>
        </div>
      ) : (
        <>
          {/* Discovery decides whether this is a "go live" or a "join", so
              offering either before it answers would flip the button under the
              player's cursor. */}
          {broadcast.discovering && (phase === "idle" || phase === "ended") ? (
            <p className="mt-2 text-[11.5px] text-white/52">
              Checking whether this game is already being broadcast…
            </p>
          ) : phase === "idle" || phase === "ended" || phase === "error" ? (
            broadcast.joinable.length > 0 ? (
              <>
                <JoinExisting broadcast={broadcast} />
                {/* Still available, but only to an account that may create a
                    stream: a second stream of the same activity is legitimate,
                    and the host may not want a guest. A citizen can join
                    without being a creator, so offering them a button that
                    would 403 would be the wrong thing to show. */}
                {broadcast.isCreator ? (
                  <button
                    onClick={() => setConfirming(true)}
                    disabled={broadcast.busy}
                    className={`${CASINO_SECONDARY_BUTTON_CLASS} ${buttonSize} mt-2`}
                  >
                    Start my own instead
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <p className="mt-2 text-[11.5px] leading-[1.55] text-white/52">
                  Share {copy.subject} as a live stream on Market Square. Anyone can watch it there,
                  and the description links back here.
                </p>
                <button
                  onClick={() => setConfirming(true)}
                  disabled={broadcast.busy}
                  className={`${CASINO_PRIMARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
                >
                  {phase === "ended" ? "Go live again" : "Go live"}
                </button>
              </>
            )
          ) : null}

          {phase === "joining" ? (
            <div className="mt-2">
              <p className="text-[11.5px] leading-[1.55] text-white/58">
                Waiting for the host to let you in. Nothing is going out yet, and you will appear in
                their broadcast as soon as they approve you.
              </p>
              <button
                onClick={() => void broadcast.cancelJoin()}
                disabled={broadcast.busy}
                className={`${CASINO_SECONDARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
              >
                Cancel request
              </button>
            </div>
          ) : null}

          {phase === "join-declined" ? (
            <div className="mt-2">
              <p className="text-[11.5px] leading-[1.55] text-white/58">
                The host did not let you into their broadcast. You can ask again, or start your own.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {broadcast.joinable[0] ? (
                  <button
                    onClick={() => void broadcast.join(broadcast.joinable[0].id)}
                    disabled={broadcast.busy}
                    className={`${CASINO_SECONDARY_BUTTON_CLASS} ${buttonSize}`}
                  >
                    Ask again
                  </button>
                ) : null}
                {broadcast.isCreator ? (
                  <button
                    onClick={() => setConfirming(true)}
                    disabled={broadcast.busy}
                    className={`${CASINO_PRIMARY_BUTTON_CLASS} ${buttonSize}`}
                  >
                    Start my own broadcast
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {phase === "host-ended" ? (
            <div className="mt-2">
              <p className="text-[11.5px] leading-[1.55] text-white/58">
                The broadcast you were in has ended, so nothing is going out from this page any
                more. The host ended it, or their connection dropped.
              </p>
              <button
                onClick={() => setConfirming(true)}
                disabled={broadcast.busy}
                className={`${CASINO_PRIMARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
              >
                Start my own broadcast
              </button>
            </div>
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
                  className={`${CASINO_PRIMARY_BUTTON_CLASS} ${buttonSize}`}
                >
                  {broadcast.busy ? "…" : `Share ${copy.subject} again`}
                </button>
                <button
                  onClick={() => void broadcast.stop()}
                  disabled={broadcast.busy}
                  className={`${CASINO_SECONDARY_BUTTON_CLASS} ${buttonSize}`}
                >
                  End broadcast
                </button>
              </div>
              <SpeakerRequests broadcast={broadcast} />
            </div>
          ) : null}

          {phase === "live" ? (
            <div className="mt-2">
              <p className="text-[11.5px] leading-[1.55] text-white/58">
                {broadcast.role === "guest"
                  ? `You are publishing into ${broadcastLabel(broadcast.stream)}. Your camera goes out in the host's stream.`
                  : `Sharing ${broadcast.surface ?? "the surface you picked"}. Everything visible on it is going out live.`}
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
              {activityOver ? (
                <p className="mt-2.5 rounded-[10px] bg-black/20 px-3 py-2 text-[11.5px] leading-[1.5] text-white/70">
                  {copy.finishedNotice}
                </p>
              ) : null}
              {/* A guest joined without sharing a surface, so their screen
                  share is an extra rather than the thing that stopped. It
                  needs its own click for the picker's user activation. */}
              {broadcast.role === "guest" && !broadcast.sharingScreen ? (
                <button
                  onClick={() => void broadcast.resumeScreenShare()}
                  disabled={broadcast.busy}
                  className={`${CASINO_SECONDARY_BUTTON_CLASS} ${buttonSize} mt-2.5 mr-2`}
                >
                  {broadcast.busy ? "…" : `Share ${copy.subject} too`}
                </button>
              ) : null}
              <button
                onClick={() => void broadcast.stop()}
                disabled={broadcast.busy}
                className={`${CASINO_SECONDARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
              >
                {broadcast.busy
                  ? "…"
                  : broadcast.role === "guest"
                    ? "Leave broadcast"
                    : "End broadcast"}
              </button>
              <SpeakerRequests broadcast={broadcast} />
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
                className={`${CASINO_PRIMARY_BUTTON_CLASS} ${buttonSize} mt-2.5`}
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
          warning={`A screen share broadcasts everything visible on the surface you choose, including notifications and other tabs. Pick the single tab holding ${copy.subject}, not your whole screen. Your browser asks you next, and you can stop at any time.`}
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

/**
 * Provider and panel in one, for the layouts that render the control exactly
 * once. A layout that renders it twice must mount `GameBroadcastProvider`
 * itself, above both copies.
 */
export function GameGoLive({
  target,
  copy,
  activityOver = false,
}: {
  target: GameBroadcastTarget | null;
  copy: BroadcastCopy;
  activityOver?: boolean;
}) {
  const broadcast = useGameBroadcast(target);
  return (
    <GameBroadcastProvider broadcast={broadcast} copy={copy}>
      <GoLivePanel activityOver={activityOver} />
    </GameBroadcastProvider>
  );
}
