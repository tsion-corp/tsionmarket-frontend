"use client";

import { motion, useReducedMotion } from "motion/react";

export type TradeMode = "swap" | "limit" | "perps";

const MODES: { id: TradeMode; label: string }[] = [
  { id: "swap", label: "Swap" },
  { id: "limit", label: "Limit" },
  { id: "perps", label: "Perps" },
];

interface TradeModeTabsProps {
  active: TradeMode;
  onChange: (mode: TradeMode) => void;
}

export function TradeModeTabs({ active, onChange }: TradeModeTabsProps) {
  const reduce = useReducedMotion();

  return (
    <div className="ws-inset grid grid-cols-3 gap-1 p-1">
      {MODES.map((m) => {
        const on = m.id === active;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={`relative cursor-pointer rounded-xl py-2.5 font-sans text-sm font-medium transition-colors ${
              on ? "text-white" : "text-white/55 hover:text-white/80"
            }`}
          >
            {on ? (
              <motion.span
                layoutId="trade-mode-pill"
                transition={
                  reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }
                }
                className="bg-accent/16 absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_rgba(167,139,250,0.35)]"
              />
            ) : null}
            <span className="relative z-[1]">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
