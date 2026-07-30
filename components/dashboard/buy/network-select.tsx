"use client";

import { useTranslations } from "next-intl";
import { CoinBadge } from "@/components/ui/coin-badge";
import { CheckIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";

export interface NetworkOption {
  chainId: number;
  name: string;
  logoUrl: string | null;
}

function Glyph({
  name,
  logoUrl,
  size = 22,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
}) {
  if (logoUrl) {
    return (
      // Dextopus serves chain logos from varied hosts; next/image would reject them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full bg-white/6 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return <CoinBadge sym={name.slice(0, 2).toUpperCase()} bg="#26262b" size={size} />;
}

interface NetworkSelectProps {
  options: NetworkOption[];
  selected: number;
  onOpen: () => void;
}

// Collapsed network row: the selected network as a logo and name. Opens the full
// picker when there is more than one option; a single-network asset is a static
// row with no chooser.
export function NetworkSelect({ options, selected, onOpen }: NetworkSelectProps) {
  const t = useTranslations("buySell");
  const current = options.find((o) => o.chainId === selected) ?? options[0];
  if (!current) return null;
  const single = options.length <= 1;

  return (
    <button
      type="button"
      disabled={single}
      onClick={onOpen}
      className={`flex w-full items-center gap-2.5 rounded-[13px] border border-white/10 bg-white/4 px-3.5 py-2.5 text-left ${
        single ? "cursor-default" : "cursor-pointer transition-colors hover:bg-white/8"
      }`}
    >
      <Glyph name={current.name} logoUrl={current.logoUrl} />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-normal tracking-[0.04em] text-white/45 uppercase">
          {t("network")}
        </span>
        <span className="block truncate font-sans text-[14px] font-medium text-white">
          {current.name}
        </span>
      </span>
      {single ? null : <ChevronLeftIcon size={14} className="-rotate-90 text-white/40" />}
    </button>
  );
}

interface NetworkPickerProps {
  options: NetworkOption[];
  selected: number;
  onSelect: (chainId: number) => void;
  onBack: () => void;
}

// The network chooser as a sub-screen inside the buy sheet, following the funds
// sheet pattern: a back header plus the full list of networks. Same on mobile and
// desktop, so it never overflows the modal.
export function NetworkPicker({ options, selected, onSelect, onBack }: NetworkPickerProps) {
  const t = useTranslations("buySell");
  return (
    <div>
      <SheetNav title={t("chooseNetwork")} onBack={onBack} />
      <div className="flex flex-col gap-1.5">
        {options.map((o) => {
          const on = o.chainId === selected;
          return (
            <button
              key={o.chainId}
              type="button"
              onClick={() => onSelect(o.chainId)}
              className={`flex w-full cursor-pointer items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors ${
                on ? "border-accent/45 bg-accent/12" : "border-white/8 bg-white/4 hover:bg-white/8"
              }`}
            >
              <Glyph name={o.name} logoUrl={o.logoUrl} size={26} />
              <span className="min-w-0 flex-1 truncate font-sans text-[14.5px] font-medium text-white">
                {o.name}
              </span>
              {on ? (
                <span className="text-accent">
                  <CheckIcon size={16} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
