"use client";

import { useEffect } from "react";
import {
  RoomAudioRenderer,
  StartAudio,
  TrackToggle,
  VideoTrack,
  isTrackReference,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";

export interface LiveVideoParticipantLabel {
  identities: string[];
  label: string;
}

export function CameraIcon({
  className = "h-4 w-4",
  disabled = false,
}: {
  className?: string;
  disabled?: boolean;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <rect x="3" y="6" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m16 10 5-2.5v9L16 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {disabled ? (
        <path d="M4 4 20 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicrophoneIcon({ disabled = false }: { disabled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {disabled ? (
        <path d="M4 4 20 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

function participantRole(metadata?: string): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

function matchesKnownPlayer(
  ref: TrackReferenceOrPlaceholder,
  labels: LiveVideoParticipantLabel[]
): boolean {
  const identity = ref.participant.identity.toLowerCase();
  return labels.some((entry) =>
    entry.identities.some((candidate) => candidate.toLowerCase() === identity)
  );
}

function isPlayerParticipant(
  ref: TrackReferenceOrPlaceholder,
  labels: LiveVideoParticipantLabel[]
): boolean {
  const role = participantRole(ref.participant.metadata);
  // Metadata can arrive a render after the participant/track. Match against
  // the two known seats during that gap so player two does not disappear.
  return role === "player" || (role === null && matchesKnownPlayer(ref, labels));
}

function participantLabel(
  ref: TrackReferenceOrPlaceholder,
  labels: LiveVideoParticipantLabel[]
): string {
  const identity = ref.participant.identity.toLowerCase();
  return (
    labels.find((entry) =>
      entry.identities.some((candidate) => candidate.toLowerCase() === identity)
    )?.label ??
    ref.participant.name ??
    ref.participant.identity
  );
}

function ParticipantCamera({
  trackRef,
  labels,
  compact = false,
}: {
  trackRef: TrackReferenceOrPlaceholder | undefined;
  labels: LiveVideoParticipantLabel[];
  compact?: boolean;
}) {
  if (!trackRef) {
    return (
      <div className="flex h-full min-h-[112px] items-center justify-center bg-[radial-gradient(circle_at_50%_30%,#31302d_0%,#191816_70%)] text-center">
        <div>
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-white/8 bg-white/5 text-white/25">
            <CameraIcon />
          </div>
          <div className="mt-2 text-[11px] text-white/38">Waiting for camera</div>
        </div>
      </div>
    );
  }

  const label = participantLabel(trackRef, labels);
  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#171614]">
      {isTrackReference(trackRef) ? (
        <VideoTrack
          trackRef={trackRef}
          playsInline
          className={`h-full w-full object-cover ${trackRef.participant.isLocal ? "scale-x-[-1]" : ""}`}
        />
      ) : (
        <div className="flex h-full min-h-[112px] items-center justify-center bg-[radial-gradient(circle_at_50%_30%,#34322f_0%,#191816_72%)]">
          <span className="grid h-12 w-12 place-items-center rounded-full border border-white/8 bg-white/6 text-[15px] font-semibold text-white/55">
            {label.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}
      <div
        className={`absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/80 to-transparent ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}
      >
        <div className="truncate text-[11px] font-medium text-white/85">{label}</div>
      </div>
    </div>
  );
}

export function LiveVideoRoom({
  viewer,
  participants,
  onLeave,
  onPlayerCount,
}: {
  viewer: "player" | "spectator";
  participants: LiveVideoParticipantLabel[];
  onLeave: () => void;
  onPlayerCount: (count: number) => void;
}) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const roomParticipants = useParticipants();
  const connection = useConnectionState();
  const { isMicrophoneEnabled, isCameraEnabled, lastCameraError } = useLocalParticipant();
  const playerTracks = tracks.filter((track) => isPlayerParticipant(track, participants));
  const local = playerTracks.find((track) => track.participant.isLocal);
  const remote = playerTracks.filter((track) => !track.participant.isLocal);
  const connecting = connection !== ConnectionState.Connected;

  useEffect(() => {
    onPlayerCount(
      roomParticipants.filter((participant) => participantRole(participant.metadata) === "player")
        .length
    );
  }, [onPlayerCount, roomParticipants]);

  return (
    <div className="relative h-full min-h-[168px] overflow-hidden bg-[#171614]">
      <RoomAudioRenderer />
      {viewer === "spectator" ? (
        <div className={`grid h-full ${remote.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {(remote.length > 0 ? remote.slice(0, 2) : [undefined]).map((trackRef, index) => (
            <ParticipantCamera
              key={trackRef?.participant.identity ?? `empty-${index}`}
              trackRef={trackRef}
              labels={participants}
            />
          ))}
        </div>
      ) : (
        <>
          <ParticipantCamera trackRef={remote[0]} labels={participants} />
          {local ? (
            <div className="absolute right-2 bottom-2 h-[38%] min-h-[58px] w-[30%] min-w-[84px] overflow-hidden rounded-[8px] border border-white/18 bg-[#211f1c] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
              <ParticipantCamera trackRef={local} labels={participants} compact />
            </div>
          ) : null}
        </>
      )}

      <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full border border-white/8 bg-black/55 px-2 py-1 backdrop-blur-md">
        <span
          className={`h-1.5 w-1.5 rounded-full ${connecting ? "animate-pulse bg-amber-300" : "bg-red-500"}`}
        />
        <span className="text-[9px] font-semibold tracking-[0.12em] text-white/75 uppercase">
          {connecting ? "Connecting" : "Live"}
        </span>
      </div>

      <StartAudio
        className="absolute top-2 right-11 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[10px] font-medium text-white backdrop-blur-md"
        label="Tap for sound"
      />

      {viewer === "player" && lastCameraError && !isCameraEnabled ? (
        <div
          role="alert"
          className="absolute top-12 left-1/2 z-20 w-[min(90%,320px)] -translate-x-1/2 rounded-[8px] border border-amber-300/25 bg-black/82 px-3 py-2 text-center text-[10px] leading-4 text-amber-100 shadow-lg backdrop-blur-md"
        >
          Camera unavailable. Allow camera access, then tap the camera button to retry.
        </div>
      ) : null}

      {viewer === "player" ? (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-black/70 p-1.5 shadow-lg backdrop-blur-md">
          <TrackToggle
            source={Track.Source.Microphone}
            showIcon={false}
            className={`grid h-8 w-8 place-items-center rounded-full text-white transition-colors disabled:cursor-wait disabled:opacity-60 ${
              isMicrophoneEnabled
                ? "bg-white/10 hover:bg-white/18"
                : "bg-[#b53b35] hover:bg-[#ca4942]"
            }`}
            aria-label={isMicrophoneEnabled ? "Turn microphone off" : "Turn microphone on"}
            title={isMicrophoneEnabled ? "Microphone on" : "Microphone off"}
          >
            <MicrophoneIcon disabled={!isMicrophoneEnabled} />
          </TrackToggle>
          <TrackToggle
            source={Track.Source.Camera}
            captureOptions={{
              facingMode: "user",
              resolution: { width: 1920, height: 1080, frameRate: 30 },
              frameRate: { ideal: 30, max: 30 },
            }}
            showIcon={false}
            className={`grid h-8 w-8 place-items-center rounded-full text-white transition-colors disabled:cursor-wait disabled:opacity-60 ${
              isCameraEnabled ? "bg-white/10 hover:bg-white/18" : "bg-[#b53b35] hover:bg-[#ca4942]"
            }`}
            aria-label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
            title={isCameraEnabled ? "Camera on" : "Camera off"}
          >
            <CameraIcon disabled={!isCameraEnabled} />
          </TrackToggle>
          <button
            type="button"
            onClick={onLeave}
            className="h-8 cursor-pointer rounded-full bg-[#b53b35] px-3 text-[10px] font-semibold text-white transition-colors hover:bg-[#ca4942]"
          >
            Leave
          </button>
        </div>
      ) : null}
    </div>
  );
}
