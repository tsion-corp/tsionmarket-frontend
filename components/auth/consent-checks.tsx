"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { BRAND } from "@/lib/brand";
import { toast } from "@/lib/toast";
import {
  consentServerSnapshot,
  consentSnapshot,
  setConsent,
  subscribeConsent,
} from "@/lib/consent";

// The two questions every sign in method waits on: accepting the terms and
// the privacy policy, which is required, and product email, which is not.
// Both boxes start ticked. Unticking the terms darkens every sign in method,
// and a toast says why at once so nobody is left wondering. Both documents
// open beside the sign in so a reader does not lose their place. The answers
// live in lib/consent, so they survive an OAuth round trip and a returning
// person on this device sees what they chose.

const BOX =
  "mt-[3px] size-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border border-white/25 bg-white/5 transition-colors checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function DocumentLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-white/85 underline decoration-white/35 underline-offset-2 hover:text-white"
    >
      {children}
    </a>
  );
}

export function useConsent() {
  return useSyncExternalStore(subscribeConsent, consentSnapshot, consentServerSnapshot);
}

export function ConsentChecks() {
  const t = useTranslations("auth");
  const consent = useConsent();

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3">
      <label className="flex cursor-pointer items-start gap-3 text-[12.5px] leading-[1.5] text-white/60">
        <input
          type="checkbox"
          name="terms"
          className={BOX}
          checked={consent.terms}
          onChange={(e) => {
            setConsent({ terms: e.target.checked, marketing: consent.marketing });
            if (!e.target.checked) toast.error(t("agreeRequired"));
          }}
        />
        <span>
          {t.rich("agreeCheckbox", {
            brand: BRAND,
            terms: (chunks) => <DocumentLink href="/terms">{chunks}</DocumentLink>,
            privacy: (chunks) => <DocumentLink href="/privacy">{chunks}</DocumentLink>,
          })}
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 text-[12.5px] leading-[1.5] text-white/60">
        <input
          type="checkbox"
          name="marketing"
          className={BOX}
          checked={consent.marketing}
          onChange={(e) => setConsent({ terms: consent.terms, marketing: e.target.checked })}
        />
        <span>{t("marketingOptIn", { brand: BRAND })}</span>
      </label>
      {consent.terms ? null : (
        <p className="text-[12px] text-white/40" role="status">
          {t("agreeToContinue")}
        </p>
      )}
    </div>
  );
}
