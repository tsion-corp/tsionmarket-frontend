"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { useShine, type ShineService } from "@/hooks/use-shine";
import { cn } from "@/lib/utils";

// The Shine control for one service page: a switch and the word Shine,
// deliberately loud rather than tucked into a settings sheet. Shine is on by
// default and posts publicly without asking each time, so the place a person
// finds out about it has to be the page they are trading on.
//
// The service is the only thing it takes. Everything else — the account's
// answer, whether that answer has actually arrived, and the write — comes
// from useShine, so dropping this onto a page wires nothing up by hand.
//
// The copy carries the part people would otherwise discover afterwards:
// turning Shine off stops new posts and does not retract old ones.

export interface ShineToggleProps {
  /** Which service's Shine this switch decides. */
  service: ShineService;
  /** Placement only, for the page dropping it in. */
  className?: string;
}

export function ShineToggle({ service, className }: ShineToggleProps) {
  const t = useTranslations("shine");
  const shine = useShine();
  const titleId = useId();
  const blurbId = useId();
  const keepsId = useId();
  const [saveFailed, setSaveFailed] = useState(false);

  const on = shine.isOn(service);
  const readFailed = shine.error !== null && shine.error !== undefined && !shine.isResolved;
  // Nothing to flip until the account's own answer is in hand: before that
  // the switch is showing a default, not a decision.
  const disabled = !shine.isSignedIn || !shine.isResolved || shine.isSaving;

  const status = !shine.isSignedIn
    ? t("signedOut")
    : shine.isResolved
      ? on
        ? t("on")
        : t("off")
      : readFailed
        ? null
        : t("checking");

  function flip(next: boolean) {
    setSaveFailed(false);
    // The rejection is handled, not swallowed: the hook has already put the
    // switch back, and this is what tells the person the account never
    // recorded what they just did.
    void shine.setShine(service, next).catch((error: unknown) => {
      console.error("[shine] could not save the setting:", error);
      setSaveFailed(true);
    });
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "ws-card border-hairline flex flex-col gap-2 rounded-[14px] border px-4 py-3.5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-baseline gap-2">
          <span id={titleId} className="ws-display text-[17px] tracking-[-0.01em] text-white">
            {t("name")}
          </span>
          {status ? <span className="text-[12px] text-white/55">{status}</span> : null}
        </span>
        <Switch
          checked={on}
          disabled={disabled}
          aria-busy={shine.isLoading || shine.isSaving ? "true" : undefined}
          aria-label={t("toggleLabel")}
          aria-describedby={`${blurbId} ${keepsId}`}
          onCheckedChange={flip}
        />
      </div>

      <p id={blurbId} className="max-w-[60ch] text-[12.5px] leading-[1.5] text-white/55">
        {t("blurb")}
      </p>
      <p id={keepsId} className="max-w-[60ch] text-[12.5px] leading-[1.5] text-white/40">
        {t("keepsPosts")}
      </p>

      {readFailed ? (
        <p role="alert" className="text-destructive text-[12.5px] leading-[1.5]">
          {t("readFailed")}{" "}
          <button type="button" onClick={shine.refetch} className="underline underline-offset-2">
            {t("retry")}
          </button>
        </p>
      ) : null}

      {saveFailed ? (
        <p role="alert" className="text-destructive text-[12.5px] leading-[1.5]">
          {t("saveFailed")}
        </p>
      ) : null}
    </section>
  );
}
