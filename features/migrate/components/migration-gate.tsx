"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { LegacyPrivyProvider } from "@/components/providers/legacy-privy-provider";
import { useAuthSession } from "@/hooks/use-auth-session";
import { track } from "@/lib/analytics/mixpanel";
import type { VenueAdapter } from "@/lib/migration/types";
import { useOfferMigration } from "@/features/migrate/hooks/use-offer-migration";
import { MoveOldMoneyFrame } from "@/features/migrate/components/move-old-money-frame";
import { closeMigration, useMigrationRequest } from "@/features/migrate/lib/migration-card-store";
import { UpgradeHeader } from "@/features/migrate/components/upgrade-header";
import { upgradeView } from "@/features/migrate/lib/upgrade-progress";
import { SUPPORT_EMAIL } from "@/lib/brand";
import {
  gateDoneKey,
  gateSnoozeKey,
  SNOOZE_FAILING_MS,
  SNOOZE_NO_ACCESS_MS,
  STUCK_AFTER_FAILURES,
  useGateFlags,
  writeGateDone,
  writeGateSnooze,
} from "@/features/migrate/lib/gate-state";
import {
  MoveOldMoneyPanel,
  type MigrationProgress,
} from "@/features/migrate/components/move-old-money-panel";

// The design's action: a white pill, dark text. The gold is the bar's.
const PRIMARY =
  "w-full cursor-pointer rounded-full bg-gradient-to-b from-white to-[#DADADA] px-4 py-[15px] font-sans text-[17px] font-semibold text-[#111] transition-[transform,opacity] hover:opacity-95 active:scale-[0.99] motion-reduce:transform-none";
const SECONDARY =
  "w-full cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-3 font-sans text-[14px] font-semibold text-white hover:bg-white/10";
const QUIET =
  "cursor-pointer font-sans text-[13px] text-white/45 underline-offset-2 hover:text-white/70 hover:underline";
const NOTE = "text-[13px] leading-normal text-white/55";

type SnoozeReason = "no_access" | "failing" | "browser" | "blocked";

/**
 * The migration as a gate: an overlay nobody can close until the old account
 * is linked and its CORE money — native, the stablecoins, KSH — has crossed.
 *
 * Deliberately not "every last token". A memecoin that reverts on transfer, a
 * perp position awaiting settlement, a market awaiting resolution — none of
 * those should hold the whole app shut. They are the long tail, and the
 * account menu keeps an always-open door to them ("Move money from old
 * wallet"). The gate is for the money a user would be hurt to leave behind.
 *
 * "Core cleared" is the panel's own on-chain discovery, not the service's
 * flag, which also fires while a ledger re-key is pending — a backend queue
 * the user cannot act on.
 *
 * Two kinds of exit. `finish` is permanent: the gate's conditions were met, or
 * (blocked) can never be met for this account. `snooze` is a delay, never a
 * claim of completion: it puts the gate away for a window and it comes back.
 * That is what stops the three traps — cannot sign into the old account,
 * discovery keeps failing, the core sweep keeps failing — from holding the
 * app shut forever, without letting anyone skip a migration that could still
 * finish. The balance-card offer and the account-menu entry stay open while
 * the gate is snoozed.
 */
export function MigrationGate({ adapters }: { adapters: readonly VenueAdapter[] }) {
  const t = useTranslations("migrate");
  const offer = useOfferMigration();
  const session = useAuthSession();
  const key = gateDoneKey(session.evmAddress);
  const snoozeKey = gateSnoozeKey(session.evmAddress);
  // Live, not a copy taken at mount: an upgrade finished in the sheet marks
  // the account done, and this must see it before it can open.
  const { done: doneHere, snoozed: snoozedHere } = useGateFlags(session.evmAddress);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  // The "I can't sign in" exit asks once before it acts.
  const [confirmingNoAccess, setConfirmingNoAccess] = useState(false);
  // The offer is consulted only to OPEN the gate. Once open it stays until one
  // of its own exits closes it, whatever the offer says next — because the
  // offer flips to "no" the moment the service reports the link, which is
  // BEFORE the sweep has moved the money, and unmounting here tears down the
  // Privy iframe the in-flight sweep is signing with ("iframe did not
  // initialize"). Seen live: linked, sweep failed, money left behind, and no
  // gate ever again to retry from. (Adjusting state during render is the
  // documented pattern for a latch; it re-renders before commit.)
  const [opened, setOpened] = useState(false);
  if (offer && !opened) setOpened(true);
  // A door asked for the card — the balance card, the account menu, the way
  // back from the old provider's sign-in. Same card, same panel; only the
  // lock differs: held by the offer it cannot be put away, opened by a door
  // it can.
  const request = useMigrationRequest();
  const held = opened && !doneHere && !snoozedHere;
  const locked = held;

  // A step is being signed or mined right now. Every exit below is withheld
  // while it is: the header promises the app waits until it is done, and a
  // "Continue" offered between a transfer being signed and it landing is how
  // somebody walks away mid-sweep.
  const running = progress?.running === true;
  // Done means done: the essentials are across AND nothing more is about to
  // run. The core count alone read as done before the sweep had started, and
  // again between a miss and its retry.
  const canFinish =
    progress !== null &&
    !running &&
    progress.linked &&
    progress.discovered &&
    progress.coreRemaining === 0 &&
    progress.settled;
  // Linking failed in a way no retry can fix — the old wallet belongs to a
  // different account. There is nothing the user can do here, so the gate stops
  // being a wall and offers a way out instead of looping on "link again".
  const blocked = !running && progress?.blocked === true;
  // This browser will not load the wallet window at all (ad blocker,
  // third-party storage off). Retrying cannot fix it, so there is no reason to
  // make the user fail three times first: the way out is offered at once.
  const walletBlocked = !running && !blocked && !canFinish && progress?.walletBlocked === true;
  // The current step has failed enough times in a row that "try again" is no
  // longer an honest offer on its own.
  const stuck =
    !running &&
    !blocked &&
    !canFinish &&
    !walletBlocked &&
    (progress?.failures ?? 0) >= STUCK_AFTER_FAILURES;
  const stage = progress?.stage ?? "signIn";

  const finish = useCallback(() => {
    if (!canFinish) return;
    writeGateDone(key);
    closeMigration();
  }, [canFinish, key]);

  // Exit a gate that can never be completed here — the old account belongs
  // to another Market 2.0 account. Put away for the long window, never marked
  // DONE: "Go to Market" on a finished upgrade is the one thing that marks an
  // account done, and this account has not upgraded. Support may yet sort out
  // whose it is, and the gate should come back for that.
  // Putting the gate away is two things: the snooze flag, which stops the
  // OFFER holding the card, and closing the card itself, which a door (the
  // balance card, the account menu) may have opened. The flag alone left a
  // door-opened card on screen with its exit already taken — "Continue for
  // now" that did not continue.
  const leave = useCallback(() => {
    writeGateSnooze(snoozeKey, Date.now() + SNOOZE_NO_ACCESS_MS);
    track("migration_gate_snoozed", { reason: "blocked", stage });
    closeMigration();
  }, [snoozeKey, stage]);

  const snooze = useCallback(
    (reason: SnoozeReason) => {
      const span = reason === "no_access" ? SNOOZE_NO_ACCESS_MS : SNOOZE_FAILING_MS;
      writeGateSnooze(snoozeKey, Date.now() + span);
      track("migration_gate_snoozed", { reason, stage });
      closeMigration();
    },
    [snoozeKey, stage]
  );

  const ignore = useCallback(() => {}, []);

  if (!held && request === null) return null;
  const coreLeft = progress?.linked === true && !canFinish && !stuck && !walletBlocked;
  const atSignIn =
    !running && stage === "signIn" && !blocked && !stuck && !walletBlocked && !canFinish;
  const view = upgradeView(progress, canFinish);
  return (
    <MoveOldMoneyFrame dismissible={!locked} onClose={locked ? ignore : closeMigration}>
      <LegacyPrivyProvider>
        <UpgradeHeader view={view} variant={locked ? "gate" : "finish"} />
        <div className="px-[26px] pt-5 pb-[26px]">
          <MoveOldMoneyPanel
            adapters={adapters}
            entry={locked ? "gate" : (request?.entry ?? "gate")}
            locked={locked}
            onProgress={setProgress}
            // The panel's own close buttons are hidden while locked, and no
            // other path may finish the gate: only Go to Market below does.
            // Opened by a door, the panel's close simply puts the card away.
            onClose={locked ? ignore : closeMigration}
            compact
            // One action at a time. Whenever the footer below draws a button,
            // the panel draws none: "Check again" next to "Continue for now"
            // asked the reader to choose between two next steps at once.
            footerAction={blocked || canFinish || walletBlocked || stuck}
          />
          {blocked ? (
            <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
              <p className={NOTE}>{t("gateBlockedBody")}</p>
              <button onClick={leave} className={PRIMARY}>
                {t("gateBlockedExit")}
              </button>
            </div>
          ) : canFinish ? (
            <div className="mt-5">
              <button onClick={finish} className={PRIMARY}>
                {t("goToMarket")}
              </button>
            </div>
          ) : walletBlocked ? (
            <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
              <p className={NOTE}>{t("gateWalletBlockedBody")}</p>
              <button onClick={() => snooze("browser")} className={SECONDARY}>
                {t("gateContinueLater")}
              </button>
            </div>
          ) : stuck ? (
            <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
              <p className={NOTE}>{t("gateStuckBody")}</p>
              <button onClick={() => snooze("failing")} className={SECONDARY}>
                {t("gateContinueLater")}
              </button>
            </div>
          ) : coreLeft ? (
            <div className="mt-5 border-t border-white/10 pt-4">
              <p className={NOTE}>{t("gateCoreLeft")}</p>
            </div>
          ) : atSignIn ? (
            <div className="mt-6 border-t border-white/10 pt-6">
              {confirmingNoAccess ? (
                <div className="space-y-3">
                  <p className={NOTE}>{t("gateNoAccessBody")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setConfirmingNoAccess(false)} className={SECONDARY}>
                      {t("gateNoAccessBack")}
                    </button>
                    <button onClick={() => snooze("no_access")} className={PRIMARY}>
                      {t("gateContinueLater")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <button onClick={() => setConfirmingNoAccess(true)} className={QUIET}>
                    {t("needHelp")}
                  </button>
                </div>
              )}
            </div>
          ) : null}
          {/* The design's footer line. At the old sign-in the same words open
            the "having trouble" exit above instead, which already names
            support. */}
          {!atSignIn || confirmingNoAccess ? (
            <p className="mt-6 border-t border-white/10 pt-6 text-center">
              <a href={`mailto:${SUPPORT_EMAIL}`} className={QUIET}>
                {t("needHelp")}
              </a>
            </p>
          ) : null}
        </div>
      </LegacyPrivyProvider>
    </MoveOldMoneyFrame>
  );
}
