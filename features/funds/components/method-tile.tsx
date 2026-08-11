"use client";

import { ArrowRightIcon } from "@/components/ui/icons";

interface MethodTileProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}

// A selectable method row in the chooser step. One job: present a path and
// report the tap.
export function MethodTile({ icon, title, subtitle, badge, onClick }: MethodTileProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3.5 rounded-[16px] border border-white/8 bg-white/4 px-4 py-3.5 text-left transition-colors hover:bg-white/8"
    >
      <span className="bg-accent/14 text-accent grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[12px]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-sans text-[15px] font-semibold text-white">{title}</span>
          {badge ? (
            <span className="rounded-full border border-white/12 bg-white/6 px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] text-white/55 uppercase">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-[1.4] font-normal text-white/55">
          {subtitle}
        </span>
      </span>
      <span className="text-white/35">
        <ArrowRightIcon size={16} />
      </span>
    </button>
  );
}
