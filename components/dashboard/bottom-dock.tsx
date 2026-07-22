"use client";

import { motion } from "motion/react";
import { NAV_ITEMS } from "@/components/dashboard/nav-items";
import type { DashboardView } from "@/components/dashboard/modal-types";

interface BottomDockProps {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
}

export function BottomDock({ view, onViewChange }: BottomDockProps) {
  const items = NAV_ITEMS.filter((n) => !n.href);
  return (
    <nav className="bg-panel/94 fixed bottom-3 left-1/2 z-[120] flex w-[min(420px,calc(100%-24px))] -translate-x-1/2 items-end justify-between rounded-[26px] border border-white/10 px-2 pt-1.5 pb-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[18px] md:hidden">
      {items.map((n) => {
        const active = view === n.key;
        return (
          <motion.button
            key={n.key}
            onClick={() => onViewChange(n.key as DashboardView)}
            whileTap={{ scale: 0.9 }}
            className="flex flex-1 cursor-pointer flex-col items-center gap-[3px] px-1 py-[7px] font-sans text-[10px] font-medium"
          >
            <motion.span
              animate={{ scale: active ? 1.18 : 1, y: active ? -2 : 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className={`grid h-[22px] w-[22px] place-items-center ${
                active ? "text-accent" : "text-white/50"
              }`}
            >
              <n.icon size={22} />
            </motion.span>
            <span className={active ? "text-accent" : "text-white/50"}>{n.label}</span>
            <span
              className={`h-1 w-1 rounded-full transition-opacity ${
                active ? "bg-accent opacity-100" : "opacity-0"
              }`}
            />
          </motion.button>
        );
      })}
    </nav>
  );
}
