"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseBestMoveLine,
  parseEngineInfoLine,
  type EngineInfo,
} from "@/features/casino/lib/chess/engine-analysis";

const ENGINE_CANDIDATES = [
  {
    label: "Stockfish 18 Lite",
    workerUrl: "/stockfish/stockfish-18-lite-single.js",
  },
] as const;
const ANALYSIS_TIME_MS = 250;

export interface ChessEngineState extends EngineInfo {
  bestMove: string | null;
  label: string;
  status: "unsupported" | "loading" | "ready" | "analyzing" | "error";
  error: string | null;
}

const EMPTY_ENGINE_INFO: EngineInfo = {
  depth: null,
  scoreCp: null,
  scoreMate: null,
  pv: [],
};

function canUseEngine(): boolean {
  return (
    typeof window !== "undefined" && typeof Worker === "function" && typeof WebAssembly === "object"
  );
}

export function useChessEngine(fen: string | null, enabled = true) {
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const lastFenRef = useRef<string | null>(null);
  const fallbackRef = useRef(0);
  const [state, setState] = useState<ChessEngineState>(() =>
    enabled && canUseEngine()
      ? {
          ...EMPTY_ENGINE_INFO,
          bestMove: null,
          label: ENGINE_CANDIDATES[0].label,
          status: "loading",
          error: null,
        }
      : {
          ...EMPTY_ENGINE_INFO,
          bestMove: null,
          label: ENGINE_CANDIDATES[0].label,
          status: "unsupported",
          error: null,
        }
  );

  useEffect(() => {
    if (!enabled || !canUseEngine()) return;

    const startWorker = (index: number) => {
      const candidate = ENGINE_CANDIDATES[index];
      fallbackRef.current = index;
      const worker = new Worker(candidate.workerUrl);
      workerRef.current = worker;
      readyRef.current = false;

      const fallback = () => {
        if (workerRef.current !== worker) return;
        try {
          worker.terminate();
        } catch {}
        const next = index + 1;
        if (ENGINE_CANDIDATES[next]) {
          setState({
            ...EMPTY_ENGINE_INFO,
            bestMove: null,
            label: ENGINE_CANDIDATES[next].label,
            status: "loading",
            error: null,
          });
          startWorker(next);
          return;
        }
        setState({
          ...EMPTY_ENGINE_INFO,
          bestMove: null,
          label: candidate.label,
          status: "error",
          error: "Stockfish failed to start.",
        });
      };

      worker.onmessage = (event) => {
        const line = String(event.data ?? "").trim();

        if (line === "uciok") {
          worker.postMessage("setoption name UCI_ShowWDL value true");
          worker.postMessage("isready");
          return;
        }

        if (line === "readyok") {
          readyRef.current = true;
          setState((current) => ({
            ...current,
            label: candidate.label,
            status: "ready",
            error: null,
          }));
          if (lastFenRef.current) {
            worker.postMessage("position fen " + lastFenRef.current);
            worker.postMessage("go movetime " + String(ANALYSIS_TIME_MS));
            setState((current) => ({ ...current, label: candidate.label, status: "analyzing" }));
          }
          return;
        }

        if (line.startsWith("info ")) {
          const next = parseEngineInfoLine(line);
          if (!next) return;
          setState((current) => ({
            ...current,
            ...next,
            label: candidate.label,
            bestMove: current.bestMove,
            status: "analyzing",
            error: null,
          }));
          return;
        }

        if (line.startsWith("bestmove ")) {
          const bestMove = parseBestMoveLine(line);
          setState((current) => ({
            ...current,
            label: candidate.label,
            bestMove,
            status: "ready",
            error: null,
          }));
        }
      };

      worker.onerror = fallback;
      worker.postMessage("uci");
    };

    startWorker(0);

    return () => {
      fallbackRef.current = 0;
      try {
        workerRef.current?.postMessage("quit");
      } catch {}
      workerRef.current?.terminate();
      workerRef.current = null;
      readyRef.current = false;
    };
  }, [enabled]);

  useEffect(() => {
    lastFenRef.current = fen;
    const worker = workerRef.current;
    if (!enabled || !worker || !fen || !readyRef.current) return;

    setState((current) => ({
      ...current,
      ...EMPTY_ENGINE_INFO,
      bestMove: null,
      status: "analyzing",
      error: null,
    }));

    worker.postMessage("stop");
    worker.postMessage("position fen " + fen);
    worker.postMessage("go movetime " + String(ANALYSIS_TIME_MS));
  }, [enabled, fen]);

  if (enabled && canUseEngine() && state.status === "unsupported") {
    return { ...state, status: "loading" as const };
  }
  return state;
}
