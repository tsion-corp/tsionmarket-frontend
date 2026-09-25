"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { SHINE_SERVICES, type ShineService } from "@/lib/shine";
import { useShine } from "@/hooks/use-shine";
import { cn } from "@/lib/utils";

// Shine, in the one place it now lives: the account menu.
//
// It used to be a card on each of the seven service pages, which put the
// explanation where somebody was about to act. Moving it here trades that for
// a single place to find it, so this panel carries the copy those cards were
// carrying: what Shine does, and that turning it off stops new posts without
// retracting old ones.
//
// The seven answers stay seven. A master switch writes them together, which is
// what makes "off everywhere" one decision rather than seven.

/** Which control is mid-write, so only that one reads as busy. */
type Pending = ShineService | "all" | null;

export function ShineSettings({ className }: { className?: string }) {
  const t = useTranslations("shine");
  const shine = useShine();
  const introId = useId();
  const keepsId = useId();

  const [pending, setPending] = useState<Pending>(null);
  const [failed, setFailed] = useState<Pending>(null);

  // A read that failed leaves nothing to draw. Distinct from "still arriving":
  // one waits, the other needs the person to do something.
  const readFailed = shine.error !== null && shine.error !== undefined && !shine.isResolved;
  // Nothing may be flipped until the account's own answers are in hand, or
  // while any write is in flight: the hook serialises them, and a second flip
  // would race the first.
  const locked = !shine.isSignedIn || !shine.isResolved || shine.isSaving;

  const allOff = shine.preferences !== null && SHINE_SERVICES.every((s) => !shine.preferences?.[s]);
  // Three states, because seven booleans do not fit in two. "Mixed" is drawn
  // rather than collapsed to off: off would claim Shine was off on services
  // that are still posting.
  const masterState: "on" | "off" | "mixed" = shine.allOn ? "on" : allOff ? "off" : "mixed";

  function run(key: Pending, write: () => Promise<void>) {
    if (locked) return;
    setFailed(null);
    setPending(key);
    // Handled, not swallowed: the hook has already rolled the switch back, and
    // this is what stops somebody believing a setting saved when it did not.
    void write()
      .catch((error: unknown) => {
        console.error("[shine] could not save the setting:", error);
        setFailed(key);
      })
      .finally(() => setPending(null));
  }

  const masterStatus = !shine.isSignedIn
    ? t("signedOut")
    : readFailed
      ? null
      : !shine.isResolved
        ? t("checking")
        : masterState === "on"
          ? t("allOn")
          : masterState === "off"
            ? t("allOff")
            : t("allMixed");

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <p id={introId} className="text-[12.5px] leading-[1.55] text-white/55">
        {t("settingsIntro")}
      </p>

      {readFailed ? (
        <p role="alert" className="text-destructive text-[12.5px] leading-[1.5]">
          {t("readFailed")}{" "}
          <button type="button" onClick={shine.refetch} className="underline underline-offset-2">
            {t("retry")}
          </button>
        </p>
      ) : null}

      {/* The master, above its own rule: it decides all seven below, so it
          reads as their heading rather than an eighth row. */}
      <div className="border-hairline flex items-center justify-between gap-4 border-b pb-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-[14px] font-semibold text-white">{t("allLabel")}</span>
          {masterStatus ? (
            <span className="mt-0.5 text-[12px] text-white/45">{masterStatus}</span>
          ) : null}
        </span>
        <Switch
          checked={masterState === "on"}
          disabled={locked}
          aria-label={t("allLabel")}
          aria-describedby={`${introId} ${keepsId}`}
          // A switch has two positions and this has three, so the third is
          // stated for assistive tech rather than mimed in the track. Spread
          // only when mixed: passing the key as undefined clears the one
          // base-ui sets, leaving the switch with no state at all.
          {...(masterState === "mixed" ? { "aria-checked": "mixed" as const } : {})}
          aria-busy={pending === "all" || (!shine.isResolved && !readFailed) ? "true" : undefined}
          onCheckedChange={() =>
            // From mixed, turn everything ON. It is the position the product
            // ships in, and the one somebody reaching a half-set panel is
            // most likely to want; turning the rest off is a tap away.
            run("all", () => shine.setAll(masterState !== "on"))
          }
        />
      </div>

      <ul className="flex flex-col">
        {SHINE_SERVICES.map((service) => {
          const on = shine.isOn(service);
          const busy = pending === service;
          return (
            <li key={service}>
              <div
                role="group"
                aria-label={t(`services.${service}`)}
                className="flex flex-col gap-1 py-2.5"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[13.5px] text-white/85">{t(`services.${service}`)}</span>
                  <Switch
                    size="sm"
                    checked={on}
                    disabled={locked}
                    aria-label={t(`services.${service}`)}
                    aria-busy={busy || (!shine.isResolved && !readFailed) ? "true" : undefined}
                    onCheckedChange={(next: boolean) =>
                      run(service, () => shine.setShine(service, next))
                    }
                  />
                </div>
                {failed === service ? (
                  <p role="alert" className="text-destructive text-[12px] leading-[1.5]">
                    {t("saveFailed")}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {failed === "all" ? (
        <p role="alert" className="text-destructive text-[12px] leading-[1.5]">
          {t("saveFailed")}
        </p>
      ) : null}

      <p id={keepsId} className="text-[12px] leading-[1.5] text-white/40">
        {t("keepsPosts")}
      </p>
    </div>
  );
}
