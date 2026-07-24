"use client";

import { AssetIcon } from "@/components/ui/asset-icon";
import { AssetChart } from "@/components/ui/asset-chart";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DETAIL_LINE, Sparkline } from "@/components/ui/sparkline";
import { isUp } from "@/lib/format";
import type { DetailPayload } from "@/components/dashboard/modal-types";

export function DetailModal({ detail }: { detail: DetailPayload }) {
  return (
    <div>
      <Eyebrow>Asset details</Eyebrow>
      <div className="mt-3 flex items-center gap-[13px]">
        <AssetIcon sym={detail.sym} bg={detail.bg} size={44} logo={detail.logo} />
        <div className="min-w-0 flex-1">
          <div className="ws-serif text-[23px] tracking-[-0.01em]">{detail.name}</div>
          <div className="truncate text-[12.5px] font-normal text-white/50">{detail.sub}</div>
        </div>
        <div className="text-right">
          <div className="ws-serif tnum text-[22px]">{detail.price}</div>
          <div className={`text-[13px] font-normal ${isUp(detail.chg) ? "text-up" : "text-down"}`}>
            {detail.chg}
          </div>
        </div>
      </div>
      {detail.coingeckoId ? (
        <div className="mt-4">
          <AssetChart coingeckoId={detail.coingeckoId} up={detail.up ?? isUp(detail.chg)} />
        </div>
      ) : (
        <div className="mt-4 rounded-[14px] bg-[linear-gradient(180deg,rgba(167,139,250,0.12),rgba(167,139,250,0))]">
          <Sparkline id="detail" line={DETAIL_LINE} height={120} viewHeight={120} />
        </div>
      )}
      <div className="mt-4 flex flex-col gap-[11px] text-[13.5px] font-normal text-white/60">
        {detail.stats.map((s) => (
          <div key={s.k} className="flex justify-between">
            <span>{s.k}</span>
            <span className="text-white">{s.v}</span>
          </div>
        ))}
      </div>
      {detail.cta && detail.onCta ? (
        <button
          onClick={detail.onCta}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {detail.cta}
        </button>
      ) : null}
    </div>
  );
}
