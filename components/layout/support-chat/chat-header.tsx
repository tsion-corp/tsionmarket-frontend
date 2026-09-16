"use client";

import { useTranslations } from "next-intl";

interface ChatHeaderProps {
  onClose: () => void;
  onMinimize?: () => void;
}

export function ChatHeader({ onClose, onMinimize }: ChatHeaderProps) {
  const t = useTranslations("supportChat");

  return (
    <div className="relative flex flex-col border-b border-white/10 bg-white/[0.04] px-4 py-3 select-none">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative grid size-9 place-items-center rounded-full border border-white/15 bg-white/10 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/support.png"
              alt="Support Mascot"
              width={26}
              height={26}
              className="h-6 w-6 grayscale"
            />
            <span className="absolute -right-0.5 -bottom-0.5 flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full border border-black bg-emerald-500" />
            </span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold tracking-tight text-white">
                {t("headerTitle")}
              </span>
              <span className="py-0.2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-400">
                {t("onlineStatus")}
              </span>
            </div>
            <span className="text-[11px] text-white/50">{t("responseEstimate")}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              className="hidden size-7 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white md:grid"
              aria-label={t("minimize")}
              title={t("minimize")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={t("close")}
            title={t("close")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
