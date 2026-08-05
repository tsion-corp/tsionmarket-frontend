"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Why a live camera scan failed, so the UI can tell a user-denied prompt
// apart from a device that has no camera or browser support at all.
export type QrScannerError = "denied" | "unavailable";

interface UseQrScanner {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scanning: boolean;
  error: QrScannerError | null;
  start: () => Promise<void>;
  stop: () => void;
}

// Owns the camera for a single QR scan: opens a getUserMedia video stream and
// samples frames onto an off-screen canvas for jsQR to decode, one requestAnimationFrame
// at a time. Stops itself the instant a code decodes, so the caller only has to
// call stop() on cancel or unmount, mirroring useVoiceRecord's stream lifecycle.
export function useQrScanner(onDetect: (value: string) => void): UseQrScanner {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  // "Latest callback" refs: read from event handlers/rAF callbacks, but only
  // ever written from an effect, never during render, so the scan loop below
  // can call the current closure without depending on it and re-looping.
  const onDetectRef = useRef(onDetect);
  const tickRef = useRef<() => void>(() => {});

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<QrScannerError | null>(null);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      frameRef.current = requestAnimationFrame(() => tickRef.current());
      return;
    }
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      frameRef.current = requestAnimationFrame(() => tickRef.current());
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(frame.data, frame.width, frame.height, {
      inversionAttempts: "dontInvert",
    });
    if (result?.data) {
      stop();
      onDetectRef.current(result.data);
      return;
    }
    frameRef.current = requestAnimationFrame(() => tickRef.current());
  }, [stop]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("unavailable");
      return;
    }
    try {
      // The environment-facing camera is the one that reads a QR code held
      // up to the screen; front-facing would point at the user instead.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setError("unavailable");
        return;
      }
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      frameRef.current = requestAnimationFrame(() => tickRef.current());
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "unavailable"
      );
    }
  }, []);

  // Never leave the camera open if the component unmounts mid-scan.
  useEffect(() => stop, [stop]);

  return { videoRef, scanning, error, start, stop };
}
