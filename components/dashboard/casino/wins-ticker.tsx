"use client";

import { TICKER_WINS } from "@/lib/casino/demo";

// Horizontal marquee of recent big wins. The list is rendered twice and the
// keyframe slides exactly half the track width, so the loop is seamless.
export function WinsTicker() {
  const loop = [...TICKER_WINS, ...TICKER_WINS];

  return (
    <div>
      <div className="mb-2.5 text-[12px] font-semibold tracking-[0.06em] text-white/50 uppercase">
        Top wins today
      </div>
      <div className="ws-inset overflow-hidden rounded-[16px] py-3.5 whitespace-nowrap">
        <div className="inline-flex [animation:ws-ticker-scroll_30s_linear_infinite] gap-3.5 px-3.5 hover:[animation-play-state:paused]">
          {loop.map((w, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-white/5 py-2 pr-4 pl-2 backdrop-blur-md"
            >
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-white/6 text-[15px]">
                🏆
              </span>
              <span>
                <span className="ws-display tnum text-grey-100 block text-[14.5px]">
                  {w.amount}
                </span>
                <span className="block text-[10.5px] font-normal text-white/40">
                  {w.game} · {w.user} · {w.time}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
