"use client";

import { SETTLED_DEMO_ENTRIES } from "@/lib/casino/demo";
import { NumberChip } from "@/components/dashboard/casino/draw/number-chip";
import { useDrawEntries } from "@/components/dashboard/casino/draw/use-draw-entries";

export function EntriesSection() {
  const { entries } = useDrawEntries();

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pt-8 pb-20 sm:px-6">
      <div className="ws-display mb-5 text-[24px]">My entries</div>

      {entries.length === 0 && SETTLED_DEMO_ENTRIES.length === 0 ? (
        <div className="py-16 text-center text-[13px] font-normal text-white/45">
          No entries yet — pick your numbers in the draw.
        </div>
      ) : null}

      {entries.map((e) => (
        <div key={e.createdAt} className="ws-glass mb-3 rounded-[14px] px-5 py-4.5">
          <div className="mb-2.5 text-[12px] font-normal text-white/50">
            This draw · entry locked in
          </div>
          <div className="flex gap-1.5">
            {e.main.map((num) => (
              <NumberChip key={num} num={num} />
            ))}
            <NumberChip num={e.bonus} variant="bonus" />
          </div>
        </div>
      ))}

      {SETTLED_DEMO_ENTRIES.map((e) => (
        <div key={e.status} className="ws-glass mb-3 rounded-[14px] px-5 py-4.5">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="text-[12px] font-normal text-white/50">{e.status}</div>
            {e.prize ? (
              <div className="ws-display tnum text-grey-100 text-[18px]">{e.prize}</div>
            ) : null}
          </div>
          <div className="flex gap-1.5">
            {e.main.map((num) => (
              <NumberChip
                key={num}
                num={num}
                variant={e.matched.includes(num) ? "matched" : "plain"}
              />
            ))}
            <NumberChip num={e.bonus} variant="bonus" />
          </div>
        </div>
      ))}
    </div>
  );
}
