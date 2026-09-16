import Image from "next/image";
import type { ChessCoachLesson } from "@/features/casino/lib/api/types";

const LESSON_ART: Readonly<Record<string, string>> = {
  "core.rook": "/chess/learn/pieces/R.svg",
  "core.bishop": "/chess/learn/pieces/B.svg",
  "core.knight": "/chess/learn/pieces/N.svg",
  "core.pawn": "/chess/learn/pieces/P.svg",
  "core.king": "/chess/learn/pieces/K.svg",
  "core.queen": "/chess/learn/pieces/Q.svg",
  "core.capture": "/chess/learn/bowman.svg",
  "core.check": "/chess/learn/winged-sword.svg",
  "core.castling": "/chess/learn/castle.svg",
  "core.promotion": "/chess/learn/unlocking.svg",
  "core.hanging-piece": "/chess/learn/bullseye.svg",
  "core.fork": "/chess/learn/crossed-swords.svg",
  "core.pin": "/chess/learn/bolt-shield.svg",
  "core.mate-one": "/chess/learn/guillotine.svg",
};

export function LessonArtwork({
  lesson,
  className = "h-16 w-16",
}: {
  lesson: ChessCoachLesson;
  className?: string;
}) {
  const src = LESSON_ART[lesson.key] ?? "/chess/learn/robot-golem.svg";
  return (
    <span className={`relative grid shrink-0 place-items-center text-[#b8c0c6] ${className}`}>
      <Image
        src={src}
        alt=""
        width={80}
        height={80}
        className="h-full w-full object-contain opacity-75 grayscale"
      />
    </span>
  );
}

export function LessonStars({ rank, large = false }: { rank: 0 | 1 | 2 | 3; large?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rank} of 3 stars`}>
      {[1, 2, 3].map((star) => (
        <svg
          key={star}
          viewBox="0 0 24 24"
          className={large ? "h-12 w-12" : "h-3.5 w-3.5"}
          aria-hidden
        >
          <path
            d="m12 2.8 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.89 1.05-6.12L3.1 9.27l6.15-.9L12 2.8Z"
            fill={star <= rank ? "#d6b75c" : "rgba(255,255,255,0.1)"}
          />
        </svg>
      ))}
    </span>
  );
}
