import Image from "next/image";
import type { PieceColor } from "@/features/casino/lib/chess/engine";
import type { ChessPuzzleSpeechReference } from "@/features/casino/lib/api/types";
import type { PuzzleFeedback } from "@/features/casino/lib/chess/puzzle";

interface PuzzleMoveLine {
  uci: string;
  correct: boolean;
  opponent?: boolean;
}

interface PuzzleToolsProps {
  feedback: PuzzleFeedback;
  message: string;
  orientation: PieceColor;
  moves: PuzzleMoveLine[];
  speech: ChessPuzzleSpeechReference | null;
  hintAvailable: boolean;
  checking: boolean;
  onHint: () => void;
  onListen: () => void;
  onRestart: () => void;
  onNext: () => void;
}

function FeedbackMark({
  feedback,
  orientation,
}: Pick<PuzzleToolsProps, "feedback" | "orientation">) {
  if (feedback === "init") {
    return (
      <Image
        src={`/piece/neo/${orientation}k.png`}
        alt=""
        width={64}
        height={64}
        className="size-16 object-contain opacity-90"
      />
    );
  }
  return (
    <span
      className={`grid size-16 place-items-center text-[48px] font-light ${
        feedback === "fail" ? "text-[#d85040]" : "text-[#7fa650]"
      }`}
      aria-hidden
    >
      {feedback === "fail" ? "×" : "✓"}
    </span>
  );
}

function feedbackTitle(feedback: PuzzleFeedback): string {
  if (feedback === "good") return "Best move";
  if (feedback === "fail") return "Not the move";
  if (feedback === "complete") return "Puzzle complete";
  return "Your turn";
}

export function PuzzleTools({
  feedback,
  message,
  orientation,
  moves,
  speech,
  hintAvailable,
  checking,
  onHint,
  onListen,
  onRestart,
  onNext,
}: PuzzleToolsProps) {
  return (
    <section className="order-2 flex min-h-[390px] flex-col overflow-hidden rounded-[7px] border border-white/[0.07] bg-[#262522] shadow-[0_10px_30px_rgba(0,0,0,0.2)] xl:order-3">
      <div className="min-h-0 flex-1 overflow-y-auto border-b border-white/[0.07] px-2 py-2">
        {moves.length ? (
          <div className="grid grid-cols-2 gap-1 text-[12px] font-semibold tabular-nums">
            {moves.map((move, index) => (
              <div
                key={`${move.uci}-${index}`}
                className={`flex h-8 items-center gap-2 rounded-[4px] px-2.5 ${
                  move.opponent
                    ? "text-white/48"
                    : move.correct
                      ? "bg-[#354225] text-[#b7cf89]"
                      : "bg-[#4a2723] text-[#e08a80]"
                }`}
              >
                <span className="w-4 text-white/25">{index + 1}.</span>
                {move.uci.slice(0, 2)}–{move.uci.slice(2)}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-full min-h-24 place-items-center text-[11px] text-white/24">
            Find the best continuation
          </div>
        )}
      </div>

      <div
        className={`flex min-h-[190px] flex-col justify-center px-5 py-5 ${
          feedback === "fail"
            ? "bg-[#2e2220]"
            : feedback === "complete"
              ? "bg-[#202b1d]"
              : "bg-[#201f1d]"
        }`}
      >
        <div className="flex items-center gap-3">
          <FeedbackMark feedback={feedback} orientation={orientation} />
          <div className="min-w-0">
            <strong className="block text-[20px] leading-tight font-semibold text-white/84">
              {feedbackTitle(feedback)}
            </strong>
            <p className="mt-1 text-[12px] leading-5 text-white/46">{message}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {feedback !== "complete" && hintAvailable ? (
            <button
              type="button"
              disabled={checking}
              onClick={onHint}
              className="h-9 rounded-[5px] bg-[#3a3a36] px-4 text-[11px] font-bold text-white/68 transition-colors hover:bg-[#484843] disabled:opacity-40"
            >
              Get a hint
            </button>
          ) : null}
          {speech ? (
            <button
              type="button"
              onClick={onListen}
              className="h-9 rounded-[5px] border border-white/[0.09] px-4 text-[11px] font-bold text-white/56 transition-colors hover:bg-white/[0.05] hover:text-white/78"
            >
              Listen
            </button>
          ) : null}
          {feedback === "complete" ? (
            <button
              type="button"
              onClick={onNext}
              className="h-9 rounded-[5px] bg-[#66843f] px-5 text-[11px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:bg-[#739447]"
            >
              Continue training
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid h-[52px] grid-cols-3 bg-[#1b1a18]">
        <button
          type="button"
          onClick={onRestart}
          disabled={checking}
          className="border-r border-white/[0.06] text-[11px] font-bold text-white/42 hover:bg-white/[0.04] hover:text-white/70 disabled:opacity-30"
        >
          Restart
        </button>
        <button
          type="button"
          disabled
          className="border-r border-white/[0.06] text-[18px] text-white/18"
          aria-label="Previous move"
        >
          ‹
        </button>
        <button
          type="button"
          disabled={feedback !== "complete"}
          onClick={onNext}
          className="text-[18px] text-white/42 hover:bg-white/[0.04] hover:text-white/72 disabled:text-white/14"
          aria-label="Next puzzle"
        >
          ›
        </button>
      </div>
    </section>
  );
}

export type { PuzzleMoveLine };
