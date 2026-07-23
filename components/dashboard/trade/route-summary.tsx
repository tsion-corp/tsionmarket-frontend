"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { StatLine } from "@/components/dashboard/modal-types";

interface RouteSummaryProps {
  summaryLabel: string;
  summaryValue: string;
  rows: StatLine[];
  source?: string;
  loading?: boolean;
}

export function RouteSummary({
  summaryLabel,
  summaryValue,
  rows,
  source,
  loading,
}: RouteSummaryProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <div className="ws-inset px-4 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 text-[12.5px] font-normal text-white/55">
          {summaryLabel}
          {source ? (
            <span className="text-accent rounded-full bg-white/6 px-2 py-0.5 text-[11px] font-medium">
              {source}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`tnum text-[12.5px] font-medium text-white/85 ${loading ? "opacity-40" : ""}`}
          >
            {summaryValue}
          </span>
          <motion.svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18 }}
            className="text-white/45"
          >
            <path
              d="m6 9 6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0.12 } : { duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-col gap-2 border-t border-white/8 pt-3">
              {rows.map((row) => (
                <div key={row.k} className="flex justify-between text-[12.5px] font-normal">
                  <span className="text-white/55">{row.k}</span>
                  <span className="tnum text-right" style={row.c ? { color: row.c } : undefined}>
                    {row.v}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
