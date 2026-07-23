"use client";

import { motion } from "motion/react";
import type { Interest } from "@/lib/types";
import { INTEREST_ICONS } from "@/components/ui/icons";

interface InterestCardProps {
  interest: Interest;
  selected: boolean;
  onToggle: () => void;
}

export function InterestCard({ interest, selected, onToggle }: InterestCardProps) {
  const Icon = INTEREST_ICONS[interest.icon];
  return (
    <motion.button
      role="radio"
      aria-checked={selected}
      onClick={onToggle}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18 }}
      className={`relative cursor-pointer rounded-[20px] p-4 text-left font-sans text-white transition-colors sm:p-6 ${
        selected
          ? "border-accent/55 bg-accent/12 border shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_0_0_1px_rgba(167,139,250,0.25)]"
          : "border border-white/12 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:border-white/28"
      }`}
    >
      <span
        className={`absolute top-4 right-4 grid h-6 w-6 place-items-center rounded-full transition-all duration-200 ${
          selected
            ? "border-accent bg-accent scale-100 border opacity-100"
            : "scale-[0.85] border border-white/16 bg-white/6 opacity-35"
        }`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full transition-colors duration-200 ${
            selected ? "bg-ink" : "bg-transparent"
          }`}
        />
      </span>
      <span className="border-accent/20 bg-accent/12 text-accent grid h-[46px] w-[46px] place-items-center rounded-[13px] border">
        {Icon ? <Icon size={24} /> : null}
      </span>
      <span className="ws-serif mt-4 block text-lg tracking-[-0.01em] sm:text-[22px]">
        {interest.title}
      </span>
      <span className="mt-1.5 block text-[13.5px] leading-[1.45] font-normal text-white/65">
        {interest.desc}
      </span>
    </motion.button>
  );
}
