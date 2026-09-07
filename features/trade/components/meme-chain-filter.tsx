"use client";

import { useTranslations } from "next-intl";
import type { MemeChainSlug } from "@/lib/meme/chain";

const LANES: readonly { value: MemeChainSlug | undefined; key: string }[] = [
  { value: undefined, key: "chainAll" },
  { value: "base", key: "chainBase" },
  { value: "solana", key: "chainSolana" },
];

interface MemeChainFilterProps {
  active: MemeChainSlug | undefined;
  onChange: (chain: MemeChainSlug | undefined) => void;
}

// One chain or every chain. The catalog honours ?chain, so this narrows what
// is asked for rather than what was already fetched.
export function MemeChainFilter({ active, onChange }: MemeChainFilterProps) {
  const t = useTranslations("meme");
  return (
    <div
      role="group"
      aria-label={t("chainAll")}
      className="flex items-center gap-1 rounded-[14px] border border-white/12 bg-white/4 p-1"
    >
      {LANES.map((lane) => {
        const on = lane.value === active;
        return (
          <button
            key={lane.key}
            type="button"
            onClick={() => onChange(lane.value)}
            aria-pressed={on}
            className={`h-9 cursor-pointer rounded-[10px] px-3 font-sans text-[12.5px] font-medium transition-colors ${
              on ? "bg-white/12 text-white" : "text-white/55 hover:text-white"
            }`}
          >
            {t(lane.key)}
          </button>
        );
      })}
    </div>
  );
}
