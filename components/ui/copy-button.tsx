"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const RESET_MS = 1500;

interface CopyButtonProps {
  value: string;
  // "md" is the standalone circular button (address panels, wallet modals).
  // "sm" drops the border/background for a quiet inline affordance next to
  // small text, e.g. a truncated tx hash inside a dense list row.
  size?: "md" | "sm";
}

export function CopyButton({ value, size = "md" }: CopyButtonProps) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = async () => {
    const ok = await copyText(value);
    if (!ok) {
      toast.error("Couldn't copy. Long-press the address instead.");
      return;
    }
    toast.success(t("addressCopied"));
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), RESET_MS);
  };

  return (
    <button
      onClick={copy}
      aria-label={copied ? t("copied") : t("copy")}
      className={cn(
        "grid shrink-0 cursor-pointer place-items-center rounded-full transition-colors",
        size === "md"
          ? "h-[30px] w-[30px] border border-white/12 bg-white/6 text-white/60 hover:bg-white/10 hover:text-white"
          : "h-4 w-4 text-white/35 hover:text-white/70"
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="text-up grid place-items-center"
          >
            <CheckIcon size={size === "md" ? 14 : 11} />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="grid place-items-center"
          >
            <CopyIcon size={size === "md" ? 14 : 11} />
          </motion.span>
        )}
      </AnimatePresence>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
