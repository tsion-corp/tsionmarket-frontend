"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Portal } from "@/components/ui/portal";
import { MemeWarningList, RiskBadge } from "@/features/trade/components/meme-bits";
import { useSheetDismiss } from "@/features/trade/components/mobile-trade-sheet";
import { LOW_LIQUIDITY } from "@/features/trade/hooks/use-risk-consent";
import { displaySymbol } from "@/lib/buy";
import { visibleWarnings, type MemeToken } from "@/lib/meme/api";

// The confirmation the trade contract requires before a quote is requested for
// a LOW_LIQUIDITY token. It says what the service said, in the service's words
// (the LOW_LIQUIDITY message first, then any other warning worth showing), with
// the risk badge and the disclaimer, and it continues only on an explicit
// acknowledgement. Escape, the backdrop and Cancel all cancel.
//
// The surface hosting it owns the gate: it passes `open` from useRiskConsent's
// `prompting`, `onContinue` from its `accept`, and an `onCancel` that clears
// the amount, so no preview is asked for until this is accepted.

interface MemeRiskConsentProps {
  open: boolean;
  token: MemeToken;
  onContinue: () => void;
  onCancel: () => void;
}

export function MemeRiskConsent({ open, ...props }: MemeRiskConsentProps) {
  // Mounted only while open, so the focus trap, the scroll lock and Escape
  // belong to an alert that is actually on screen.
  return open ? <ConsentAlert {...props} /> : null;
}

function ConsentAlert({ token, onContinue, onCancel }: Omit<MemeRiskConsentProps, "open">) {
  const t = useTranslations("meme");
  const titleId = useId();
  const bodyId = useId();
  const { ref, onKeyDown } = useSheetDismiss({ open: true, onClose: onCancel });

  const symbol = displaySymbol(token.symbol ?? "") || "?";
  const shown = visibleWarnings(token.warnings);
  const warnings = [
    ...shown.filter((w) => w.code === LOW_LIQUIDITY),
    ...shown.filter((w) => w.code !== LOW_LIQUIDITY),
  ];

  return (
    <Portal>
      {/* Above the trade sheet (z 420/421), which it can stack on. */}
      <div className="fixed inset-0 z-[440] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label={t("cancel")}
          tabIndex={-1}
          onClick={onCancel}
          className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        />
        <div
          ref={ref}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="ws-card relative w-full max-w-[400px] bg-[#101013] p-5 outline-none"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="ws-display text-[19px]">
              {t("consentTitle", { symbol })}
            </h2>
            <RiskBadge level={token.riskLevel} />
          </div>

          <div id={bodyId} className="ws-inset mt-3.5 p-3.5">
            <MemeWarningList warnings={warnings} className="gap-1.5 [&>li]:text-[13px]" />
          </div>

          <p className="mt-3 text-[12px] leading-[1.5] font-normal text-white/50">
            {t("riskDisclaimer")}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 cursor-pointer rounded-[13px] border border-white/14 bg-white/6 p-3 font-sans text-[14px] font-semibold text-white hover:bg-white/10"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={onContinue}
              className="ws-chrome text-ink min-h-11 cursor-pointer rounded-[13px] bg-white p-3 font-sans text-[14px] font-semibold hover:opacity-90"
            >
              {t("consentContinue")}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
