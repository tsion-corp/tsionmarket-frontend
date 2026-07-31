"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { vlog } from "@/lib/voice/log";

// Picks a recording container the browser actually supports. Chrome/Firefox
// give webm/opus; Safari gives mp4. Gemini accepts all of these, so we just
// use whichever the platform offers rather than forcing one.
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

// How the capture ended, so the UI can distinguish "nothing said" from a real
// clip. "empty" means the user tapped but never spoke.
type CaptureOutcome =
  { blob: Blob; reason: "silence" | "maxDuration" } | { blob: null; reason: "empty" };

// One spoken command is short. Auto-stop after this much silence, and never
// listen longer than the hard cap even if the room stays noisy. SILENCE_MS is
// generous so a natural mid-sentence pause ("Vivid… what's my balance") is NOT
// mistaken for the end of the utterance and cut off.
const SILENCE_MS = 1500;
const MAX_MS = 15000;
// Below this normalized RMS level we treat the mic as silent. Set above typical
// mic hiss / room tone so a genuine pause is detected; speech sits well above
// it. Raised from an earlier value that mistook ambient noise for speech and so
// never registered a pause (recordings ran to the max cap).
const SILENCE_LEVEL = 0.03;
// How often we sample the mic level while deciding if speech has stopped.
const POLL_MS = 100;
// While tuning, log the live level so the threshold can be set from real data.
// On while we debug the cut-off: prints the live mic RMS level each poll so we
// can SEE whether a mid-word dip below SILENCE_LEVEL is triggering an early stop.
const DEBUG_LEVELS = true;

interface UseVoiceRecord {
  recording: boolean;
  supported: boolean;
  // Opens the mic, records one utterance, and resolves when the speaker pauses
  // (or the max cap is hit). The caller does not stop it manually.
  capture: () => Promise<CaptureOutcome>;
}

// Owns the microphone for a single hands-free utterance: opens a getUserMedia
// stream, records with MediaRecorder, watches the input level via the Web Audio
// API, and auto-stops once the speaker has paused. Kept separate from the
// command flow so the capture mechanics stay testable and the stream is always
// released (on finish and on unmount) rather than leaking the mic indicator.
export function useVoiceRecord(): UseVoiceRecord {
  const [recording, setRecording] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pollRef = useRef<number | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof MediaRecorder !== "undefined";

  const cleanup = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setRecording(false);
  }, []);

  const capture = useCallback(async (): Promise<CaptureOutcome> => {
    vlog("capture", "requesting mic");
    // Echo cancellation + noise suppression are ESSENTIAL for a hands-free loop:
    // without them Vivid's own spoken answer leaks back into the mic, gets
    // captured as "speech", and the loop answers its own tail forever. These ask
    // the browser's audio stack to subtract the played-back audio and room noise.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    vlog("capture", "mic granted");
    streamRef.current = stream;
    const chunks: Blob[] = [];

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Analyser reads the live input level so we can tell speech from silence.
    // The context can start suspended (browsers gate audio on a user gesture),
    // in which case the analyser reads all zeros; resume it before polling.
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    if (audioCtx.state === "suspended") {
      await audioCtx.resume().catch(() => {});
    }
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    return new Promise<CaptureOutcome>((resolve) => {
      const startedAt = Date.now();
      // Assume the user is about to speak: only start the silence countdown
      // once we have actually heard sound, so an initial beat of quiet before
      // they talk does not cut them off.
      let heardSpeech = false;
      let quietSince = 0;
      let reason: "silence" | "maxDuration" = "silence";

      recorder.onstop = () => {
        if (pollRef.current !== null) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
        const type = recorder.mimeType || "audio/webm";
        const totalBytes = chunks.reduce((sum, c) => sum + c.size, 0);
        const durationMs = Date.now() - startedAt;
        cleanup();
        // Send any captured audio and let the server decide. We only treat it as
        // "empty" when no audio was recorded at all, so a mis-tuned silence
        // threshold can never silently swallow a real command.
        if (!chunks.length) {
          vlog("capture", "stopped → EMPTY (no audio)", { reason, durationMs });
          resolve({ blob: null, reason: "empty" });
        } else {
          vlog("capture", `stopped → ${reason}`, {
            durationMs,
            bytes: totalBytes,
            chunks: chunks.length,
            heardSpeech,
          });
          resolve({ blob: new Blob(chunks, { type }), reason });
        }
      };

      pollRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        // RMS of the waveform centered at 128, normalized to 0..1.
        let sumSquares = 0;
        for (let i = 0; i < samples.length; i++) {
          const v = (samples[i] - 128) / 128;
          sumSquares += v * v;
        }
        const level = Math.sqrt(sumSquares / samples.length);
        const now = Date.now();

        if (DEBUG_LEVELS) {
          vlog(
            "capture",
            `level ${level.toFixed(3)} ${level > SILENCE_LEVEL ? "SPEECH" : "quiet"}`
          );
        }

        if (level > SILENCE_LEVEL) {
          if (!heardSpeech) vlog("capture", "first speech detected", { level: +level.toFixed(3) });
          heardSpeech = true;
          quietSince = 0;
        } else if (heardSpeech) {
          if (quietSince === 0) {
            quietSince = now;
            vlog("capture", `pause started (need ${SILENCE_MS}ms of quiet to stop)`);
          }
          if (now - quietSince >= SILENCE_MS) {
            reason = "silence";
            vlog("capture", "silence threshold reached → stopping");
            recorder.stop();
            return;
          }
        }

        if (now - startedAt >= MAX_MS) {
          reason = "maxDuration";
          vlog("capture", `max duration ${MAX_MS}ms reached → stopping`);
          recorder.stop();
        }
      }, POLL_MS);

      // A timeslice makes the recorder emit chunks periodically rather than only
      // at stop, so audio is never lost even if stop fires unusually.
      recorder.start(250);
      setRecording(true);
    });
  }, [cleanup]);

  // Never leave the microphone open if the component unmounts mid-capture.
  useEffect(() => cleanup, [cleanup]);

  return { recording, supported, capture };
}
