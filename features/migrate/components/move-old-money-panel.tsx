"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useLoginWithOAuth, usePrivy, useWallets } from "@privy-io/react-auth";
import { getEmbeddedWallets } from "@/lib/user";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CheckIcon } from "@/components/ui/icons";
import { useAuthSession } from "@/hooks/use-auth-session";
import { usePortfolio } from "@/hooks/use-portfolio";
import { track } from "@/lib/analytics/mixpanel";
import { errorCode, errorStatus, isUnconfigured } from "@/lib/api/envelope";
import { formatUsd } from "@/lib/currency";
import { scheduleSettlement, sumValueUsd } from "@/lib/migration/schedule";
import type { LegacyHolding, SettleOutcome, VenueAdapter } from "@/lib/migration/types";
import { linkLegacyAccount, snapshotLegacyActivity } from "@/features/migrate/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { ethPriceFromPortfolio } from "@/features/migrate/lib/discover";
import type { RunResult } from "@/features/migrate/lib/run";
import {
  blockingHoldings,
  byVenue,
  defaultOptIn,
  isCoreAsset,
  isThrottled,
  reasonKey,
  reviewGroups,
  VENUE_ORDER,
  worthShowing,
} from "@/features/migrate/lib/review";
import { markFundsMoved, markMigrationComplete } from "@/features/migrate/lib/visibility";
import { useLegacySigner } from "@/features/migrate/hooks/use-legacy-signer";
import { useWalletWindowBlocked } from "@/features/migrate/hooks/use-wallet-window-blocked";
import { useLegacyEmailMatch } from "@/features/migrate/hooks/use-legacy-email-match";
import { useLegacyAccount } from "@/features/migrate/hooks/use-legacy-account";
import { isWalletlessLegacyAccount } from "@/features/migrate/lib/walletless";
import { isWalletWindowError } from "@/features/migrate/lib/wallet-window";
import { useFreshLegacySession } from "@/features/migrate/hooks/use-fresh-legacy-session";
import {
  MIGRATION_QUERY_PREFIX,
  useLegacyHoldings,
} from "@/features/migrate/hooks/use-legacy-holdings";
import { useMigrationRun } from "@/features/migrate/hooks/use-migration-run";
import { useMigrationStatus } from "@/features/migrate/hooks/use-migration-status";
import { useLedgerRekeys } from "@/features/migrate/hooks/use-ledger-rekeys";
import { LegacySignIn } from "@/features/migrate/components/legacy-sign-in";
import { STUCK_AFTER_FAILURES } from "@/features/migrate/lib/gate-state";
import { isSessionExpired } from "@/features/migrate/lib/session-expiry";
import { useLegacyWalletFunds } from "@/features/migrate/hooks/use-legacy-wallet-funds";

export type MigrationEntry = "balance_card" | "account_modal" | "gate";

export type MigrationStage = "signIn" | "move" | "finish";

// Link failures that no retry can fix for THIS account: the old wallet is
// already mapped to a different Decane account, so the pairing can never land
// here. The gate treats these as terminal — a way out, not "link again" — so a
// user whose old wallet belongs to another account is not trapped behind the
// overlay forever.
const TERMINAL_LINK_CODES = new Set(["LEGACY_ALREADY_LINKED"]);
// How long the card pauses before going round again after a miss.
const RETRY_PAUSE_MS = 2_500;
// Link attempts per mount, and the pauses between them.
const LINK_ATTEMPTS = 3;
const LINK_RETRY_MS = [1_500, 4_000] as const;

/** What a host needs to decide whether the user may leave, and to show where the user is. */
export interface MigrationProgress {
  /** Which of the three steps is on screen. */
  stage: MigrationStage;
  /** The pairing exists — this run linked it, or the service already had it. */
  linked: boolean;
  /** Discovery has answered at least once; before that `remaining` is unknown. */
  discovered: boolean;
  /** Holdings still on the old side after the automatic run. */
  remaining: number;
  /** Of those, the core assets (native, stablecoins, KSH) — what the gate waits on. */
  coreRemaining: number;
  /**
   * Linking can never succeed for this account — the old wallet is already
   * bound to a different one. The gate must offer an exit, not another retry.
   */
  blocked: boolean;
  /**
   * Consecutive failures of whatever step is current — linking, discovery, or
   * a core sweep. Resets when that step succeeds. Past a threshold the gate
   * offers a way out (see STUCK_AFTER_FAILURES) instead of looping.
   */
  failures: number;
  /**
   * This browser is refusing to load Privy's wallet window (an ad or tracker
   * blocker, third-party storage off), so nothing can be signed here. Known
   * before a sweep is tried, or from a sweep that failed that way. Not
   * something retrying fixes: the gate offers a way out at once.
   */
  walletBlocked: boolean;
  /**
   * A run is in flight right now. The gate hides its exits while this is true:
   * the header promises the app waits until it is done, and offering "Continue"
   * mid-sweep invites somebody to walk away between signing a transfer and
   * seeing it land.
   */
  running: boolean;
  /** How far the run in flight has got, for the one bar the header draws. */
  step: { done: number; total: number } | null;
  /**
   * A run left something behind and the panel is going round again on its
   * own. The bar stays; the caption says "checking again" rather than
   * listing what did not land.
   */
  retrying: boolean;
  /**
   * Nothing more is going to run: the sweep has finished, or discovery found
   * nothing for it to do. Right after discovery the core count can already be
   * zero while non-essential items are still about to move — and "done" shown
   * then flips back to a bar a second later. Done waits for this.
   */
  settled: boolean;
}

export interface MoveOldMoneyPanelProps {
  adapters: readonly VenueAdapter[];
  entry: MigrationEntry;
  onClose: () => void;
  /**
   * Gate mode: hides the panel's own "leave" affordances. The host owns the
   * exit (see MigrationGate's footer) and decides when it is allowed.
   */
  locked?: boolean;
  onProgress?: (progress: MigrationProgress) => void;
  /**
   * The design's card: the header above draws the title, the copy and the
   * one progress bar, so the steps here keep only what the header cannot
   * say — the action, a decision, the details of what was left.
   */
  compact?: boolean;
  /**
   * The host is drawing the one action for this state under the panel — Go
   * to Market, or a way out of a gate that cannot finish. The panel then
   * draws no action of its own: two buttons that both read as "what next"
   * (Check again beside Continue for now) is the thing this exists to stop.
   */
  footerAction?: boolean;
}

/*
  The step's action, in the upgrade gold, so the colour marks the thing
  to do next. Dark ink on gold clears contrast comfortably.
*/
// How long the "session expired" line stays before the card sends the person
// to sign in by itself. The button on it goes at once.
const SESSION_EXPIRED_REDIRECT_MS = 4_000;

const PRIMARY =
  "w-full cursor-pointer rounded-xl bg-upgrade px-4 py-3 font-sans text-[14px] font-semibold text-ink transition-[background-color,transform] hover:bg-upgrade-soft active:scale-[0.99] motion-reduce:transform-none disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "w-full cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-3 font-sans text-[14px] font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

/*
  The design's action: a white pill, dark text. Used only on the compact card,
  where the gold is spent on the bar and the colour of the button is the
  design's, not ours.
*/
const UPGRADE_PRIMARY =
  "w-full cursor-pointer rounded-full bg-gradient-to-b from-white to-[#DADADA] px-4 py-[15px] font-sans text-[17px] font-semibold text-[#111] transition-[transform,opacity] hover:opacity-95 active:scale-[0.99] motion-reduce:transform-none disabled:cursor-not-allowed disabled:opacity-50";

// The automatic run opts into nothing: everything it moves is deterministic.
const NO_OPT_IN: ReadonlySet<string> = new Set();

// The full migration flow: sign in to the old account, review what it still
// holds everywhere, run the settlement, read the summary. Must render inside
// LegacyPrivyProvider; the sheet and the balance-card button each provide
// their own.
export function MoveOldMoneyPanel({
  adapters,
  entry,
  onClose,
  locked = false,
  onProgress,
  compact = false,
  footerAction = false,
}: MoveOldMoneyPanelProps) {
  const t = useTranslations("migrate");
  const locale = useLocale();
  const privy = usePrivy();
  /*
    MOUNTED HERE, NOT ONLY IN THE SIGN-IN. Google and X leave the page and
    come back to it with the code in the URL, and it is THIS hook, on the
    page they come back to, that turns the code into a session. The sign-in
    component holds one too, but on the way back the card is showing "Start
    Upgrade" and the sign-in is not mounted — so the return sat in the URL
    and nothing happened. While it completes, the card says so.
  */
  const oauthReturn = useLoginWithOAuth();
  const oauthReturning = oauthReturn.state.status === "loading";
  /*
    THE ADDRESS ARRIVES BEFORE THE WALLET. Sign-in puts the embedded wallet's
    address on the user record at once; the wallet OBJECT comes once the
    provider's window has initialised, a moment later. In between there is
    no signer, and "no signer while signed in" used to read as "an account
    that was never on the old app" — a screen that said there was nothing to
    upgrade, to somebody whose upgrade was a second away. That moment is a
    wait, and it is drawn as one.
  */
  const { wallets: legacyWallets } = useWallets();
  const legacyWalletPending =
    privy.ready &&
    privy.authenticated &&
    getEmbeddedWallets(privy.user).length > 0 &&
    !legacyWallets.some((w) => w.walletClientType === "privy");
  const signer = useLegacySigner();
  // The wallet window never came up after sign-in — see the hook.
  const walletWindowBlocked = useWalletWindowBlocked();
  // The old account signed in is not this person's — see the hook. The signer
  // is already null for it; this is what the screen says instead.
  const emailMatch = useLegacyEmailMatch();
  // Same boolean the signer gates on; the sign-in button must not be live
  // while an inherited session is still being cleared away.
  const fresh = useFreshLegacySession();
  const session = useAuthSession();
  const newPortfolio = usePortfolio();
  const queryClient = useQueryClient();

  const status = useMigrationStatus();
  const refetchStatus = status.refetch;
  /*
    AN OLD ACCOUNT WITH NO WALLET IS STILL AN OLD ACCOUNT. Signed in to one,
    there is no signer, and "no signer while signed in" read as "never on the
    old app". But its points, profile and history are keyed on the old
    identity, not on a wallet, and the link alone brings them across. The
    directory (or the service, for an account already linked) says it is a
    real old account rather than a Privy user the sign-in just created; see
    lib/walletless. Such an account is linked, and is done when the link lands.
  */
  const directory = useLegacyAccount(status.data?.linked !== true);
  const walletless = isWalletlessLegacyAccount({
    fresh,
    ready: privy.ready,
    authenticated: privy.authenticated,
    hasUser: privy.user !== null,
    embeddedWallets: getEmbeddedWallets(privy.user).length,
    mismatch: emailMatch.mismatch,
    legacyAccountKnown: directory.has || status.data?.linked === true,
  });
  // The feed holds the old wallet's snapshot for the session; a fresh one
  // has to be re-read.
  const invalidateLegacyActivity = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: [...queryKeys.activity.all, "legacy"] }),
    [queryClient]
  );
  // What the link did to the person's Square profile, once known. `none` is
  // an account that never had one, and says nothing; a service that does not
  // report the ledger says nothing either.
  const squareOutcome = status.data?.rekey.square;
  const squareRekey = squareOutcome && squareOutcome !== "none" ? squareOutcome : null;

  const ethPriceUsd = ethPriceFromPortfolio(newPortfolio.tokens);
  // Before the old sign-in, a linked account's addresses come from the
  // server, so a fresh device can already see the on-chain venues.
  const serverLegacy = status.data?.legacy ?? null;
  const legacy = useMemo(
    () => signer?.addresses ?? serverLegacy ?? { evm: null, solana: null },
    [signer, serverLegacy]
  );
  const current = useMemo(
    () => ({ evm: session.evmAddress, solana: session.solanaAddress }),
    [session.evmAddress, session.solanaAddress]
  );
  // What the old wallet holds, read here rather than from the service, whose
  // probe sees ETH and USDC only. Known before the old sign-in for a linked
  // account, whose addresses the server already has.
  const walletFunds = useLegacyWalletFunds(legacy, legacy.evm !== null || legacy.solana !== null);
  const runnerInput = { adapters, legacy, current, signer, ethPriceUsd };
  const holdingsQuery = useLegacyHoldings(runnerInput);
  const runner = useMigrationRun(runnerInput);

  // The sign-in lapsed under the upgrade (a Decane session lasts two hours
  // and does not refresh). Every call answers 401 from then on, so nothing
  // here can finish; the card says so and sends the person back to sign in,
  // rather than listing every venue as "not answered, check back later".
  const router = useRouter();
  // The link answered 401: the sign-in is no longer valid. No retry helps.
  const [linkExpired, setLinkExpired] = useState(false);
  const sessionExpired =
    linkExpired ||
    isSessionExpired(holdingsQuery.data?.failures, holdingsQuery.error, status.error);
  const backToSignIn = useCallback(() => {
    track("migration_session_expired");
    void session.logout().finally(() => router.push("/auth"));
  }, [session, router]);
  useEffect(() => {
    if (!sessionExpired) return;
    // Long enough to read the line; the button goes at once.
    const timer = setTimeout(backToSignIn, SESSION_EXPIRED_REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [sessionExpired, backToSignIn]);

  // Null until the user touches a checkbox; the defaults apply until then and
  // reset with every re-discovery.
  const [optIn, setOptIn] = useState<Set<string> | null>(null);
  const [confirming, setConfirming] = useState(false);
  // "Start Update" pressed: the old provider's methods are drawn in place of
  // the button, by us (see LegacySignIn), never as the provider's own modal.
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  // The deterministic sweep that runs without being asked for, kept apart from
  // the opted-in run so the summary can add the two together.
  const [autoResult, setAutoResult] = useState<RunResult | null>(null);
  // Runs in a row that left a CORE asset unmoved. Resets the moment a run
  // clears every core asset it attempted.
  const [sweepFailures, setSweepFailures] = useState(0);
  // A run that failed BECAUSE the wallet window is blocked, as opposed to a
  // transfer that reverted: the raw error is replaced with what to do about it.
  const runBlocked = [autoResult, result].some(
    (r) => r !== null && [...r.results.values()].some((o) => !o.ok && isWalletWindowError(o.error))
  );
  const walletBlocked = walletWindowBlocked || runBlocked;

  useEffect(() => {
    track("migration_started", { entry });
  }, [entry]);

  // Link the two accounts the moment the old sign-in lands. Idempotent
  // upstream, so every opening may post it; a service that is not deployed
  // yet is simply not there.
  const linked = useRef(false);
  // Set only by a successful link, never by starting one. The device flag
  // below must not be written on a sweep whose link failed — that is exactly
  // how a device ends up "done" for an account the service never mapped.
  const linkLanded = useRef(false);
  // The same fact as state, for anything that renders on it.
  const [linkedHere, setLinkedHere] = useState(false);
  // The code of a terminal link failure (see TERMINAL_LINK_CODES), or null.
  // When set, the pairing can never land and the host must offer a way out.
  const [linkBlocked, setLinkBlocked] = useState<string | null>(null);
  // Non-terminal link failures in a row (a network drop, a 5xx). A link that
  // keeps failing is as much of a trap as one that can never succeed.
  const [linkFailures, setLinkFailures] = useState(0);
  // A link that fails for a passing reason is tried again, with a pause, up
  // to LINK_ATTEMPTS times. One attempt per mount was a trap: a single
  // dropped request left the account unlinked, the gate cannot finish
  // without the link, and one failure never reached the "keep failing" exit
  // — so the only way out was a reload. Each failure still counts, so the
  // exit does open once the attempts are spent.
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const link = useCallback(() => {
    // Named inner function so the retry can recurse without the callback
    // referring to itself before it is declared.
    const attemptLink = (attempt: number) => {
      linkLegacyAccount()
        .then(() => {
          linkLanded.current = true;
          setLinkedHere(true);
          setLinkBlocked(null);
          setLinkFailures(0);
          track("migration_linked");
          void refetchStatus();
          // The old wallet's history comes across with the account: taken
          // now, and again once the sweep has moved the money (below), so
          // the outgoing legs are in it. Not awaited — the feed is not the
          // link's business, and a miss is retried on the next trigger.
          void snapshotLegacyActivity().then(invalidateLegacyActivity);
        })
        .catch((error: unknown) => {
          const code = errorCode(error);
          if (code && TERMINAL_LINK_CODES.has(code)) {
            setLinkBlocked(code);
            track("migration_link_blocked", { code });
            return;
          }
          if (errorStatus(error) === 401) {
            setLinkExpired(true);
            return;
          }
          if (isUnconfigured(error)) return;
          console.error(`Linking the old account failed (attempt ${attempt})`, error);
          setLinkFailures((n) => n + 1);
          if (attempt < LINK_ATTEMPTS) {
            linkTimer.current = setTimeout(
              () => attemptLink(attempt + 1),
              LINK_RETRY_MS[attempt - 1]
            );
          }
        });
    };
    attemptLink(1);
  }, [refetchStatus, invalidateLegacyActivity]);
  useEffect(() => {
    if ((!signer && !walletless) || linked.current) return;
    linked.current = true;
    link();
  }, [signer, walletless, link]);
  useEffect(
    () => () => {
      if (linkTimer.current) clearTimeout(linkTimer.current);
    },
    []
  );

  // Old-identity data never outlives the panel.
  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: MIGRATION_QUERY_PREFIX });
    },
    [queryClient]
  );

  const holdings = useMemo(
    () => holdingsQuery.data?.holdings ?? [],
    [holdingsQuery.data?.holdings]
  );
  // Settleability is judged as of discovery; before the first discovery there
  // are no holdings to judge.
  const now = holdingsQuery.dataUpdatedAt;
  // What the automatic run settled drops out of the review; what it failed
  // stays, so the button below can retry it.
  const remaining = useMemo(
    () => (autoResult ? holdings.filter((h) => !autoResult.results.get(h.id)?.ok) : holdings),
    [holdings, autoResult]
  );
  // Tell the host where things stand. `linkLanded` is a ref, but a landed link
  // refetches the status, which is a dep here, so the report catches up.
  const serverLinked = status.data?.linked === true;
  const linkedNow = serverLinked || linkedHere;
  // From the link on, watch the services move their ledgers and refresh the
  // screens that show them — the Kash chip above all — as each one lands.
  useLedgerRekeys(linkedNow);
  // "Discovered" must mean we actually enumerated the OLD account, which needs
  // the legacy session. Without a signer the holdings query still runs on the
  // server-recorded addresses (enabled on addresses alone), but it cannot see
  // venue-held balances that require authentication — so a no-signer run that
  // finds "nothing core left" is not proof the account is clear. Gating on the
  // signer stops the gate from offering "Continue to Market 2.0" on the sign-in
  // step for an already-linked account before it has been signed into.
  // A wallet-less old account has nothing to enumerate: the link is the
  // whole upgrade, so it counts as discovered, and settled, on its own.
  const discovered = (signer !== null && holdingsQuery.dataUpdatedAt > 0) || walletless;
  const blocking = useMemo(
    () =>
      blockingHoldings(
        holdings,
        [autoResult, result].filter((r): r is RunResult => r !== null),
        now
      ),
    [holdings, autoResult, result, now]
  );
  const checked = optIn ?? defaultOptIn(remaining);
  const groups = useMemo(() => reviewGroups(remaining, checked, now), [remaining, checked, now]);
  // Which step is on screen — the same choice the render below makes.
  // On the card the automatic run IS the run: nothing is listed and nothing is
  // asked, so an opt-in position (closing at market) is not offered there —
  // it waits, like the rest of the long tail. The full panel still stops for it.
  const finishedNow =
    result ?? (autoResult && (compact || groups.optIn.length === 0) ? autoResult : null);
  // What a finished run left unsettled among the CORE assets, at hook level
  // so the card can go round again without a button. Core only: the gate is
  // done once the essentials are across, and a memecoin that reverted must
  // not pull a finished upgrade back into "checking again" — it waits for
  // "Finish upgrading" like everything else that is not essential.
  const unsettled = useMemo(() => {
    if (!finishedNow) return 0;
    const runs = [autoResult, finishedNow].filter(
      (r, i, all): r is RunResult => r !== null && all.indexOf(r) === i
    );
    const attempted = new Map(
      runs.flatMap((r) => r.plan.phases.flatMap((ph) => ph.holdings)).map((h) => [h.id, h])
    );
    // A venue that asked us to slow down has not failed the item; it waits
    // for the next door rather than sending the card round again now.
    return [...attempted.values()].filter(
      (h) =>
        isCoreAsset(h) &&
        !runs.some((r) => r.results.get(h.id)?.ok) &&
        !runs.some((r) => isThrottled(r.results.get(h.id)))
    ).length;
  }, [finishedNow, autoResult]);
  // Nothing left to run: finished, or discovered with nothing to do.
  const settled =
    finishedNow !== null ||
    walletless ||
    (discovered &&
      !holdingsQuery.isFetching &&
      groups.automatic.length === 0 &&
      groups.optIn.length === 0);
  // Whether the card is about to go round again — see the effect by `retry`.
  const retrying =
    compact &&
    finishedNow !== null &&
    unsettled > 0 &&
    !runBlocked &&
    sweepFailures < STUCK_AFTER_FAILURES;
  const stage: MigrationStage = walletless
    ? linkedNow
      ? "finish"
      : "signIn"
    : !signer
      ? "signIn"
      : finishedNow
        ? "finish"
        : "move";
  // Linked with nothing to move is the whole upgrade for such an account; the
  // one-click door closes the same way a completed sweep closes it.
  useEffect(() => {
    if (walletless && linkedNow) markMigrationComplete(session.evmAddress);
  }, [walletless, linkedNow, session.evmAddress]);
  const coreRemaining = blocking.filter(isCoreAsset).length;
  // Fetch cycles that ended in error (each already includes the client's two
  // retries), counted only while discovery is currently failing: a success
  // moves the user on to the next step, which has its own counter.
  const discoveryFailures = holdingsQuery.isError ? holdingsQuery.errorUpdateCount : 0;
  const stuckCount = Math.max(linkFailures, discoveryFailures, sweepFailures);
  useEffect(() => {
    onProgress?.({
      stage,
      linked: linkedNow,
      discovered,
      remaining: blocking.length,
      coreRemaining,
      blocked: linkBlocked !== null,
      failures: stuckCount,
      walletBlocked,
      running: runner.running,
      step:
        runner.running && runner.progress
          ? { done: runner.progress.done, total: runner.progress.total }
          : null,
      retrying,
      settled: settled && !retrying,
    });
  }, [
    onProgress,
    stage,
    linkedNow,
    discovered,
    blocking.length,
    coreRemaining,
    linkBlocked,
    stuckCount,
    walletBlocked,
    runner.running,
    runner.progress?.done,
    runner.progress?.total,
    retrying,
    settled,
  ]);

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOptIn(next);
  };

  const execute = useCallback(
    async (opted: ReadonlySet<string>): Promise<RunResult> => {
      setConfirming(false);
      const plan = scheduleSettlement(remaining, opted, now);
      console.log(
        `[migrate] moving: ${plan.phases.map((ph) => `${ph.phase}(${ph.holdings.length})`).join(" -> ") || "nothing"}` +
          `, worth $${sumValueUsd(plan.phases.flatMap((ph) => ph.holdings)).toFixed(2)}` +
          `${plan.settleLater.length ? `, ${plan.settleLater.length} left for later` : ""}`
      );
      track("migration_reviewed", {
        holdings: remaining.length,
        opted_in: opted.size,
        settle_later: plan.settleLater.length,
        value_usd: sumValueUsd(plan.phases.flatMap((p) => p.holdings)),
      });
      const outcome = await runner.run(plan);
      console.log(
        `[migrate] moved: ${outcome.outcome}, $${outcome.movedUsd.toFixed(2)} across ${outcome.movedCount} item(s)`
      );
      track("migration_completed", { outcome: outcome.outcome, moved_usd: outcome.movedUsd });
      const coreFailed = plan.phases
        .flatMap((ph) => ph.holdings)
        .filter(isCoreAsset)
        .some((h) => {
          const result = outcome.results.get(h.id);
          return result?.ok === false && !isThrottled(result);
        });
      setSweepFailures((n) => (coreFailed ? n + 1 : 0));
      if (outcome.outcome === "complete" && (linkLanded.current || serverLinked)) {
        markMigrationComplete(session.evmAddress);
      }
      // Anything that landed is the user's money in their new wallet, so it
      // stops being hidden even when the run as a whole is unfinished.
      if (outcome.movedCount > 0) {
        markFundsMoved(session.evmAddress);
        // The offer re-opens for a linked account only on money PROVEN to be
        // on the old wallet, read through this query. Re-read it now that
        // some has left, rather than letting a stale "still holds money"
        // keep the balance-card button up for another minute.
        void queryClient.invalidateQueries({ queryKey: ["legacyWalletFunds"] });
        // The sweep just wrote the old wallet's last transactions. Retake the
        // snapshot so the feed's copy of its history has them.
        void snapshotLegacyActivity().then(invalidateLegacyActivity);
      }
      void newPortfolio.refetchUntilChanged("all");
      return outcome;
    },
    [
      remaining,
      now,
      runner,
      newPortfolio,
      serverLinked,
      session.evmAddress,
      queryClient,
      invalidateLegacyActivity,
    ]
  );

  // A plain transfer carries no decision, so it no longer waits for one: the
  // deterministic group is swept the moment discovery lands. What survives to
  // the review is only what realises a price — closing a position, selling
  // shares — which is the only thing worth stopping a user for. A sweep that
  // fails stays in the review, so the button is still the way to retry it.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !signer || holdingsQuery.isFetching) return;
    if (groups.automatic.length === 0) return;
    autoRan.current = true;
    void (async () => {
      // Resolves only once the sweep has been signed and mined, so this lands
      // as an async callback, not a cascading render.
      setAutoResult(await execute(NO_OPT_IN));
    })();
  }, [signer, holdingsQuery.isFetching, groups.automatic.length, execute]);

  const start = () => {
    const risky = groups.optIn.some((h) => h.irreversible && checked.has(h.id));
    if (risky) setConfirming(true);
    else void execute(checked).then(setResult);
  };

  const retry = () => {
    setResult(null);
    setAutoResult(null);
    autoRan.current = false;
    setOptIn(null);
    // "Try again" means the link too: money that moves without it lands in
    // the new wallet, but the identity stays behind and the gate stays shut.
    if (!linkLanded.current && linkBlocked === null) link();
    void holdingsQuery.refetch();
  };

  /*
    ON THE CARD, A MISS GOES ROUND AGAIN BY ITSELF. The summary used to list
    what moved, what waited and what failed, with a "try again" under it. The
    design shows one bar and a line; so a run that left something behind
    simply runs again after a breath, with the bar still up and "checking
    again" under it — until the gate's own "this keeps failing" exit takes
    over (STUCK_AFTER_FAILURES), which is unchanged. A blocked wallet window
    is not retried: a reload is what fixes that, and the note says so.
  */
  useEffect(() => {
    if (!retrying) return;
    const timer = setTimeout(retry, RETRY_PAUSE_MS);
    return () => clearTimeout(timer);
    // `retry` is recreated every render; what decides a retry is the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrying, sweepFailures]);

  if (sessionExpired) {
    return (
      <Step compact={compact} title={t("sessionExpiredTitle")} body={t("sessionExpiredBody")}>
        <button onClick={backToSignIn} className={PRIMARY}>
          {t("sessionExpiredButton")}
        </button>
      </Step>
    );
  }

  if (!signer) {
    // The old account exists and has no wallet: the link is the upgrade. While
    // it is in flight the card says so; once it has landed, it is done. A link
    // that cannot land (blocked) falls through to the screens below, where the
    // gate offers its way out.
    if (walletless && linkBlocked === null) {
      if (!linkedNow) {
        return (
          <Step compact={compact} bare title={t("signInTitle")} body={t("updating")}>
            <p className="flex items-center justify-center gap-2 text-[13.5px] text-white/60">
              <Spinner />
              {t("updating")}
            </p>
          </Step>
        );
      }
      return (
        <Step
          compact={compact}
          bare={compact}
          title={t("summary.complete")}
          body={t("walletlessDone")}
        >
          {squareRekey ? (
            <p
              className={`mt-3 text-[13px] leading-normal ${
                squareRekey === "failed" ? "text-down" : "text-white/65"
              }`}
            >
              {t(`square.${squareRekey}`)}
            </p>
          ) : null}
          {locked || compact ? null : (
            <button onClick={onClose} className={SECONDARY}>
              {t("close")}
            </button>
          )}
        </Step>
      );
    }
    const known =
      walletFunds.data?.usd ?? (status.data?.hasLegacyFunds ? status.data.legacyFundsUsd : 0);
    // There is no signer for two unrelated reasons, and showing one screen for
    // both is what made this button do nothing: signed in to an account that
    // never had an old wallet (and that the directory does not know — a known
    // one is handled above), privy.login() returns without opening anything,
    // because Privy is already signed in. The way out is a different account,
    // so say so and offer that instead. privy.user settles with authenticated,
    // and this provider creates no wallets on login, so an account with none
    // here will not grow one.
    const signedInElsewhere = fresh && privy.authenticated && privy.user !== null;
    // Signed in to the old account as somebody else. Nothing links or moves
    // until the old sign-in matches the Decane one; say which email, and put
    // the right sign-in one tap away.
    if (emailMatch.mismatch) {
      return (
        <Step
          compact={compact}
          title={t("wrongEmailTitle")}
          body={t("wrongEmailBody", { expected: emailMatch.expected, actual: emailMatch.actual })}
        >
          <button
            onClick={() => void privy.logout().then(() => privy.login())}
            disabled={!privy.ready}
            className={PRIMARY}
          >
            {t("wrongEmailButton", { expected: emailMatch.expected })}
          </button>
        </Step>
      );
    }
    // Signed in to the right account, which has a wallet — and the wallet
    // window never came up. Say so, before the "wrong account" reading below
    // sends this user off to sign in as someone else.
    if (walletWindowBlocked) return <WalletWindowBlocked t={t} compact={compact} />;
    if (legacyWalletPending || oauthReturning) {
      return (
        <Step compact={compact} bare title={t("signInTitle")} body={t("updating")}>
          <p className="flex items-center justify-center gap-2 text-[13.5px] text-white/60">
            <Spinner />
            {t("updating")}
          </p>
        </Step>
      );
    }
    return (
      <Step
        compact={compact}
        bare={compact && !signedInElsewhere}
        title={signedInElsewhere ? t("wrongAccountTitle") : t("signInTitle")}
        body={
          signedInElsewhere ? t("wrongAccountBody") : known > 0 ? t("signInKnown") : t("signInBody")
        }
      >
        {compact && !signedInElsewhere ? (
          started && privy.ready && fresh ? (
            <LegacySignIn />
          ) : (
            <button
              onClick={() => {
                // Which condition is holding the card, when a tap seems to do
                // nothing: the button is live only once the old provider is
                // ready and the inherited session has been discarded.
                console.log(
                  `[migrate] start upgrade: privy ready ${privy.ready}, fresh ${fresh}` +
                    `, inherited session ${privy.authenticated ? "present" : "none"}`
                );
                setStarted(true);
              }}
              disabled={!privy.ready || !fresh}
              className={UPGRADE_PRIMARY}
            >
              {t("startUpdate")}
            </button>
          )
        ) : (
          <button
            onClick={() =>
              signedInElsewhere
                ? compact
                  ? void privy.logout()
                  : void privy.logout().then(() => privy.login())
                : void privy.login()
            }
            // Not merely privy.ready: between Privy being ready and the inherited
            // session being discarded, a login would be torn down by the logout
            // landing behind it — the same dead click by another route.
            disabled={!privy.ready || !fresh}
            className={PRIMARY}
          >
            {signedInElsewhere ? t("wrongAccountButton") : t("signInButton")}
          </button>
        )}
      </Step>
    );
  }

  if (runner.running && runner.progress) {
    const { done, total, message } = runner.progress;
    return (
      <Step
        compact={compact}
        bare={compact}
        title={t("runningTitle")}
        body={message || t("runningBody")}
      >
        {compact ? null : (
          <>
            <ProgressBar pct={total === 0 ? 0 : Math.round((done / total) * 100)} />
            <p className="tnum mt-2 flex items-center gap-2 text-[12.5px] text-white/55">
              <Spinner />
              {t("runningCount", { done, total })}
            </p>
          </>
        )}
        {/* No "stop" and no "continue" while a step is in flight. Both used to
            sit here, and both invited the one thing this screen exists to
            prevent: leaving between a transfer being signed and it landing.
            The run is short and the header says the app waits for it. */}
      </Step>
    );
  }

  // The automatic run is the whole migration when nothing is left to decide;
  // otherwise the summary waits for the opted-in run and reports both.
  const finished = result ?? (autoResult && groups.optIn.length === 0 ? autoResult : null);
  if (finished) {
    const runs =
      finished === autoResult
        ? [finished]
        : ([autoResult, finished].filter(Boolean) as RunResult[]);
    // A holding retried across both runs is one row, and counts as failed only
    // if no run settled it.
    const attempted = [
      ...new Map(
        runs.flatMap((r) => r.plan.phases.flatMap((p) => p.holdings)).map((h) => [h.id, h])
      ).values(),
    ];
    // Throttled by the venue is "waiting", not "failed": it is counted with
    // what settles later, and its line below says the venue is busy.
    const throttled = attempted.filter((h) => runs.some((r) => isThrottled(r.results.get(h.id))));
    const failed = attempted.filter(
      (h) => !runs.some((r) => r.results.get(h.id)?.ok) && !throttled.includes(h)
    );
    // Counted, not totalled: the upgrade is about the account carrying over,
    // and a figure here would frame it as a transfer instead.
    const movedCount = runs.reduce((sum, r) => sum + r.movedCount, 0);
    // Counted the way the review lists them, so "1 left" never sends the user
    // looking for a row worth nothing.
    const left = finished.plan.settleLater.filter(worthShowing).length + throttled.length;
    return (
      <Step
        compact={compact}
        bare={compact}
        title={t(`summary.${finished.outcome}`)}
        body={t(locked ? "gateSummaryBody" : "summaryBody")}
      >
        {compact ? null : (
          <div className="ws-inset flex flex-col gap-2 p-3.5 text-[13px]">
            <Row label={t("moved")} value={String(movedCount)} />
            <Row label={t("left")} value={String(left)} />
            <Row
              label={t("failed")}
              value={String(failed.length)}
              tone={failed.length ? "down" : undefined}
            />
          </div>
        )}
        {/* The same link moves the person's Square profile — a wsws user who
            upgrades here has upgraded there too. The service says whether
            that landed, and the one answer that must not be swallowed is
            "failed": a split Square account looks fine from this side. */}
        {squareRekey ? (
          <p
            className={`mt-3 text-[13px] leading-normal ${
              squareRekey === "failed" ? "text-down" : "text-white/65"
            }`}
          >
            {t(`square.${squareRekey}`)}
          </p>
        ) : null}
        {runBlocked ? (
          <p className="mt-3 text-[13px] leading-normal text-white/65">{t("walletBlockedBody")}</p>
        ) : failed.length > 0 && !compact ? (
          <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px] text-white/60">
            {failed.map((h) => {
              // The last run that attempted it holds the error worth showing.
              const outcome = runs.reduce<SettleOutcome | undefined>(
                (found, r) => r.results.get(h.id) ?? found,
                undefined
              );
              return (
                <li key={h.id}>
                  <span className="text-white/85">{h.label}</span>:{" "}
                  {outcome && !outcome.ok ? shortError(outcome.error) : ""}
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="mt-4 grid gap-2.5">
          {footerAction ? null : runBlocked ? (
            // A changed blocker setting only takes effect on a reload, so
            // "try again" without one would fail the same way.
            <button onClick={() => window.location.reload()} className={PRIMARY}>
              {t("walletBlockedReload")}
            </button>
          ) : (failed.length > 0 || left > 0) && !retrying ? (
            <button onClick={retry} className={compact ? UPGRADE_PRIMARY : PRIMARY}>
              {t("retry")}
            </button>
          ) : null}
          {/* On the card the gate's own footer draws Go to Market — the one
              button that finishes — so the panel draws no second one. */}
          {locked || compact ? null : (
            <button onClick={onClose} className={SECONDARY}>
              {t("done")}
            </button>
          )}
        </div>
      </Step>
    );
  }

  if (holdingsQuery.isPending) {
    return (
      <Step compact={compact} bare={compact} title={t("reviewTitle")} body={t("checking")}>
        {compact ? null : (
          <div className="flex items-center gap-2 text-[12.5px] text-white/45">
            <Spinner />
            {t("checkingNote")}
          </div>
        )}
      </Step>
    );
  }
  if (holdingsQuery.isError) {
    return (
      <Step compact={compact} title={t("reviewTitle")} body={t("checkFailed")}>
        <button onClick={() => void holdingsQuery.refetch()} className={PRIMARY}>
          {t("retry")}
        </button>
      </Step>
    );
  }

  const failures = holdingsQuery.data?.failures ?? [];
  // "Polymarket and Perpetuals" in the reader's own language.
  const listFormat = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
  const nothing = groups.automatic.length === 0 && groups.optIn.length === 0;
  const optedIrreversible = groups.optIn.filter((h) => h.irreversible && checked.has(h.id));
  // Display only. The opt-in list is deliberately not filtered: a row the user
  // is being asked to decide about never vanishes for being worth little.
  const shownAutomatic = groups.automatic.filter(worthShowing);
  const shownLater = groups.later.filter(worthShowing);
  const shownSkipped = groups.skipped.filter(worthShowing);

  return (
    <Step compact={compact} bare={compact} title={t("reviewTitle")} body={t("reviewBody")}>
      {failures.length > 0 ? (
        // Deliberately not styled as an error, and deliberately without the
        // underlying message. A venue that did not answer says nothing about
        // the user's money, and the raw text ("Not found", "wallet is not
        // connected") reads like loss to someone who is already nervous about
        // moving funds. discover() has already logged the real error.
        // On the card it is one line: the header has the title.
        compact ? (
          <p className="mb-4 text-center text-[13.5px] leading-normal text-white/60">
            {t("pendingLine", {
              places: listFormat.format(failures.map((f) => t(`venue.${f.venue}`))),
            })}
          </p>
        ) : (
          <div className="mb-4 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5">
            <div className="text-[12.5px] font-semibold text-white/85">{t("pendingTitle")}</div>
            <p className="mt-1 text-[12px] leading-normal text-white/55">
              {t("pendingBody", {
                places: listFormat.format(failures.map((f) => t(`venue.${f.venue}`))),
              })}
            </p>
          </div>
        )
      ) : null}
      {autoResult && autoResult.movedUsd > 0 && !compact ? (
        <div className="border-accent/25 bg-accent/8 mb-4 rounded-xl border px-3 py-2.5 text-[12.5px] text-white/75">
          {t("autoMoved")}
        </div>
      ) : null}
      {/* Never on the card: the header's bar says what is happening, and a
          list of tokens under it reads as a ledger to check. */}
      {compact ? null : (
        <>
          <Section title={t("automaticHeading")} holdings={shownAutomatic} t={t} />
          <Section
            title={t("optInHeading")}
            holdings={groups.optIn}
            t={t}
            checked={checked}
            onToggle={toggle}
          />
          <Section title={t("laterHeading")} holdings={shownLater} t={t} showReason />
          <Section title={t("skippedHeading")} holdings={shownSkipped} t={t} showReason />
        </>
      )}
      {nothing &&
      shownLater.length === 0 &&
      shownSkipped.length === 0 &&
      !(compact && failures.length > 0) ? (
        <p className={`text-[13.5px] text-white/60 ${compact ? "text-center" : ""}`}>
          {t("nothingToMove")}
        </p>
      ) : null}
      <div className="mt-5 grid gap-2.5">
        {/* On the card a disabled "move" under "nothing to move" is a dead
            button; the gate's own footer says what comes next. */}
        {compact ? null : (
          <button onClick={start} disabled={nothing} className={PRIMARY}>
            {t("moveButton")}
          </button>
        )}
        {/* On the card the frame's own close is the way out; a Close pill
            under the gate's footer was a second one, beside Go to Market. */}
        {locked || compact ? null : (
          <button onClick={onClose} className={SECONDARY}>
            {t("close")}
          </button>
        )}
      </div>
      {confirming ? (
        <ConfirmDialog
          open
          title={t("confirmTitle")}
          rows={optedIrreversible.map((h) => ({ label: h.label, value: formatUsd(h.valueUsd) }))}
          warning={t("confirmWarning")}
          cancelLabel={t("cancel")}
          continueLabel={t("confirmContinue")}
          onCancel={() => setConfirming(false)}
          onContinue={() => void execute(checked).then(setResult)}
        />
      ) : null}
    </Step>
  );
}

// The wallet window is blocked and nothing has been tried yet. Reload is the
// only action worth offering: after allowing Privy's domain or pausing the
// blocker, the iframe only loads on a fresh page.
function WalletWindowBlocked({ t, compact }: { t: Translate; compact: boolean }) {
  return (
    <Step compact={compact} title={t("walletBlockedTitle")} body={t("walletBlockedBody")}>
      <button onClick={() => window.location.reload()} className={PRIMARY}>
        {t("walletBlockedReload")}
      </button>
    </Step>
  );
}

/**
 * Something is happening. Shown wherever the panel is waiting on work the user
 * cannot hurry — discovery reading five venues, a sweep being signed — because
 * a paragraph that never changes reads as a hang, and this screen can sit on
 * one line for twenty seconds.
 *
 * `aria-hidden` with the label carried by the copy beside it: a screen reader
 * hears the sentence, not "image".
 */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`border-accent/70 inline-block size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-r-transparent motion-reduce:animate-none ${className}`}
    />
  );
}

function Step({
  title,
  body,
  children,
  compact = false,
  bare = false,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
  /** Under the design's header: a small label, not a second headline. */
  compact?: boolean;
  /** The header has said it all; only the children (the action) show. */
  bare?: boolean;
}) {
  if (bare) return <div className="mt-2">{children}</div>;
  if (compact) {
    return (
      <div className="mt-2">
        <div className="text-[15px] font-semibold text-white">{title}</div>
        <p className="mt-1 mb-3 text-[13.5px] leading-normal text-white/60">{body}</p>
        {children}
      </div>
    );
  }
  return (
    <div>
      <div className="ws-display text-[22px] tracking-[-0.01em] md:text-[24px]">{title}</div>
      <p className="mt-1.5 mb-4 text-[13.5px] leading-normal text-white/60">{body}</p>
      {children}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "down" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/55">{label}</span>
      <span className={`tnum font-medium ${tone === "down" ? "text-down" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

// The first line of an error, capped. Library errors (viem especially) append
// a docs link and a version banner that are noise on a review screen; the
// console still has the whole thing.
function shortError(message: string): string {
  const first = message.split("\n")[0].trim();
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

type Translate = ReturnType<typeof useTranslations<"migrate">>;

function Section({
  title,
  holdings,
  t,
  checked,
  onToggle,
  showReason,
}: {
  title: string;
  holdings: LegacyHolding[];
  t: Translate;
  checked?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
  showReason?: boolean;
}) {
  if (holdings.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[11.5px] font-semibold tracking-[0.08em] text-white/45 uppercase">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">
        {byVenue(holdings, VENUE_ORDER).map((group) => (
          <div key={group.venue}>
            <div className="mb-1 text-[12px] text-white/50">{t(`venue.${group.venue}`)}</div>
            {group.holdings.map((h) => {
              const reason = showReason ? reasonKey(h.settleability) : null;
              const isChecked = checked?.has(h.id) ?? false;
              const row = (
                <>
                  {onToggle ? (
                    <span
                      aria-hidden
                      className={`grid size-5 shrink-0 place-items-center rounded-[6px] border ${
                        isChecked ? "border-accent bg-accent/30 text-white" : "border-white/25"
                      }`}
                    >
                      {isChecked ? <CheckIcon size={12} /> : null}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-white/90">{h.label}</span>
                    {reason ? (
                      <span className="block text-[12px] text-white/50">
                        {t(`reason.${reason}`)}
                      </span>
                    ) : null}
                    {onToggle && h.irreversible ? (
                      <span className="block text-[12px] text-white/50">
                        {t("irreversibleWarning")}
                      </span>
                    ) : null}
                  </span>
                </>
              );
              const className =
                "flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-left";
              return onToggle ? (
                <button
                  key={h.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isChecked}
                  onClick={() => onToggle(h.id)}
                  className={`${className} cursor-pointer hover:bg-white/8`}
                >
                  {row}
                </button>
              ) : (
                <div key={h.id} className={className}>
                  {row}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
