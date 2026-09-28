"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BRAND } from "@/lib/brand";
import { reverseResolveArkAddress } from "@/lib/bns/api";
import { openArkIdDialog } from "@/lib/bns/ark-id-dialog-store";

// The identity card in the sidebar footer, above the account button. One
// footprint, two states — the user's own name, or the claim promo. Kept
// monochrome so it belongs to the rail; a single soft accent glow does the
// lifting, and the owned name is set in the serif display face over the
// balance-ink gradient so it reads as something you own, not a menu row.
export function ArkIdCard() {
  const t = useTranslations("bns");
  const { evmAddress } = useAuthSession();
  const reverse = useQuery({
    queryKey: ["bns", "reverse", evmAddress],
    queryFn: () => reverseResolveArkAddress(evmAddress as string),
    enabled: Boolean(evmAddress),
    staleTime: 60_000,
    retry: false,
  });
  // Only a verified reverse record is the user's own name: anyone can point a
  // reverse at any name, so an unverified one is never shown as theirs.
  const ownedName =
    reverse.data?.verified && reverse.data.name?.toLowerCase().endsWith(".ark")
      ? reverse.data.name
      : null;

  return (
    <button
      type="button"
      onClick={openArkIdDialog}
      aria-label={ownedName ? t("cardManage", { name: ownedName }) : t("cardCta", { brand: BRAND })}
      className="group hover:border-accent/45 relative mb-2.5 w-full cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-white/4 px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition-colors hover:bg-white/6"
    >
      {/* A single soft accent glow, top-right, that warms on hover — the only
          colour on an otherwise monochrome card. */}
      <span
        aria-hidden
        className="bg-accent/18 pointer-events-none absolute -top-8 -right-7 size-24 rounded-full opacity-70 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />

      <span className="relative flex items-center justify-between">
        <span className="text-[9px] font-bold tracking-[0.15em] text-white/40 uppercase">
          {t("cardLabel")}
        </span>
        <span className="border-accent/30 bg-accent/12 text-accent grid size-[22px] place-items-center rounded-full border font-serif text-[13px] leading-none font-bold">
          @
        </span>
      </span>

      {ownedName ? (
        <span className="ws-balance-ink ws-display relative mt-2 block truncate text-[17px] leading-6">
          {ownedName}
        </span>
      ) : (
        <span className="relative mt-2 block text-[14.5px] leading-[1.25] font-semibold text-white">
          {t("cardTitle")}
        </span>
      )}

      <span className="relative mt-1 flex items-center gap-1 text-[11px] leading-4 text-white/50">
        {ownedName ? (
          <>
            <svg
              viewBox="0 0 12 12"
              width="11"
              height="11"
              aria-hidden
              className="text-up shrink-0"
            >
              <path
                d="M2.4 6.3l2.2 2.2L9.6 3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="truncate">{t("cardAttached")}</span>
          </>
        ) : (
          <span>{t("cardBody")}</span>
        )}
      </span>

      <span className="text-accent relative mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold transition-colors group-hover:text-white">
        {ownedName ? t("cardManageLabel") : t("cardCta", { brand: BRAND })}
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </button>
  );
}
