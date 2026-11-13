"use client";

import { useState } from "react";
import { LockIcon } from "@/components/ui/icons";
import { NetworkIcon } from "@/components/ui/network-icon";
import type { WalletUpgradeConfig } from "@/lib/wallet-upgrade/environment";
import { useDecaneAccount } from "../hooks/use-decane-account";
import { useMoveScan, useRunMove } from "../hooks/use-move-funds";
import {
  destinationProblems,
  nothingToMove,
  sourcesMatchLink,
  type Addresses,
  type MoveChainView,
  type StuckView,
} from "../lib/move-funds";
import { walletErrorMessage } from "../lib/wallet-errors";
import { BODY, KICKER, LINK, NOTICE, PANEL, PRIMARY, SMALL, SUBTITLE, TITLE, WELL } from "./ui";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const short = (value: string | null) => (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—");

export function MoveFundsPanel({
  config,
  linked,
  destinations,
}: {
  config: WalletUpgradeConfig;
  /** The old account the link recorded. */
  linked: Addresses | null;
  /** Your NEW wallet, from its validated package. */
  destinations: Addresses;
}) {
  // The funds being moved are in the Decane wallet, whichever wallet the app is using.
  const session = useDecaneAccount();
  const sources: Addresses = { evm: session.evmAddress, solana: session.solanaAddress };
  const matches = sourcesMatchLink(sources, linked);
  const scan = useMoveScan(sources, session.authenticated && matches);
  const run = useRunMove(sources);
  const [checked, setChecked] = useState(false);

  if (!session.authenticated) {
    return (
      <section className={PANEL} aria-label="Move your funds">
        <h2 className={TITLE}>Move your funds</h2>
        <p className={BODY}>Sign in to your current account to see what can move.</p>
      </section>
    );
  }
  if (!matches) {
    return (
      <section className={PANEL} aria-label="Move your funds">
        <h2 className={TITLE}>Move your funds</h2>
        <p role="alert" className={NOTICE.warn}>
          You&apos;re signed in to a different current account than the one you connected. Sign out
          and sign in to the right one.
        </p>
      </section>
    );
  }

  const problems = destinationProblems(destinations, sources);
  const plan = scan.data?.plan;
  const result = run.data;

  return (
    <section className={PANEL} aria-label="Move your funds">
      <div className="flex flex-col gap-2.5">
        <h2 className={TITLE}>Move your funds</h2>
        <p className={BODY}>
          Here&apos;s everything that can move to your new wallet. You press one button, and your
          wallet signs each transfer.
        </p>
      </div>

      {config.dryRun ? (
        <p className={NOTICE.warn}>
          Rehearsal. Nothing will be sent. This shows exactly what would move.
        </p>
      ) : null}

      {scan.isPending ? (
        <div className="flex animate-pulse flex-col gap-2.5" aria-busy>
          <div className={`${WELL} h-[88px]`} />
          <div className={`${WELL} h-[88px]`} />
          <span className="sr-only">Checking your current wallet…</span>
        </div>
      ) : null}
      {scan.isError ? (
        <p role="alert" className={NOTICE.error}>
          {walletErrorMessage(scan.error)}
        </p>
      ) : null}

      {plan ? (
        <>
          {scan.data && scan.data.missing.length > 0 ? (
            <p className={NOTICE.warn}>
              We couldn&apos;t read {scan.data.missing.length} network
              {scan.data.missing.length === 1 ? "" : "s"} just now, so this may be more than shown.
            </p>
          ) : null}

          {plan.view.length > 0 ? (
            <ul className="flex flex-col gap-2.5" aria-label="Will move">
              {plan.view.map((chain) => (
                <ChainRow key={chain.network} chain={chain} />
              ))}
            </ul>
          ) : (
            <p className={NOTICE.good}>
              {result
                ? "All of it is across."
                : "There's nothing to move from the networks that are switched on."}
            </p>
          )}

          {plan.locked.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <h3 className={`${KICKER} flex items-center gap-2`}>
                <LockIcon size={11} /> Not available yet
              </h3>
              <ul className="flex flex-col gap-2" aria-label="Not available yet">
                {plan.locked.map((chain) => (
                  <LockedRow key={chain.network} chain={chain} />
                ))}
              </ul>
            </div>
          ) : null}

          {plan.stuck.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <h3 className={KICKER}>Can&apos;t move from here</h3>
              <ul className="flex flex-col gap-2">
                {plan.stuck.map((chain) => (
                  <LockedRow key={chain.network} chain={chain} />
                ))}
              </ul>
            </div>
          ) : null}

          {!nothingToMove(plan) ? (
            <div className="flex flex-col gap-4 border-t border-white/8 pt-5">
              <div className="flex items-baseline justify-between">
                <span className={BODY}>Total to move</span>
                <span className="ws-display text-[28px] tracking-[-0.02em] tabular-nums">
                  {usd.format(plan.totalUsd)}
                </span>
              </div>
              <div className={`${WELL} flex flex-col gap-1.5 px-4 py-3.5`}>
                <div className={SMALL}>Goes to your new wallet</div>
                <div className="font-mono text-[12.5px] text-white/80">
                  Ethereum, Arbitrum, Base: {short(destinations.evm)}
                </div>
                <div className="font-mono text-[12.5px] text-white/80">
                  Solana: {short(destinations.solana)}
                </div>
              </div>
              {problems.length > 0 ? (
                <p role="alert" className={NOTICE.error}>
                  {problems[0]}
                </p>
              ) : (
                <label className="flex cursor-pointer items-start gap-3 text-[14px] text-white/75">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-white"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                  />
                  These are my new wallet&apos;s addresses, the ones shown above.
                </label>
              )}
              <button
                type="button"
                className={PRIMARY}
                disabled={!checked || problems.length > 0 || run.isPending}
                onClick={() => run.mutate({ config, linked, destinations, plan })}
              >
                {run.isPending
                  ? "Moving…"
                  : config.dryRun
                    ? "Rehearse the move"
                    : `Move ${usd.format(plan.totalUsd)} to my new wallet`}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {run.error ? (
        <p role="alert" className={NOTICE.error}>
          {run.error.message || walletErrorMessage(run.error)}
        </p>
      ) : null}

      {result ? (
        <div role="status" className={result.failed ? NOTICE.warn : NOTICE.good}>
          {config.dryRun ? "Rehearsal: " : ""}
          {result.moved} moved{result.failed ? `, ${result.failed} didn't` : ""} (
          {usd.format(result.usdMoved)}).
          {result.failed && result.firstError ? ` ${result.firstError}` : ""}
          {result.failed && result.retryable ? " You can try again." : ""}
        </div>
      ) : null}

      <button
        type="button"
        className={LINK}
        onClick={() => void scan.refetch()}
        disabled={scan.isFetching}
      >
        {scan.isFetching ? "Checking…" : "Check again"}
      </button>
    </section>
  );
}

function ChainRow({ chain }: { chain: MoveChainView }) {
  return (
    <li className={`${WELL} px-4 py-3.5`}>
      <div className="flex items-center gap-3">
        <NetworkIcon network={chain.network} size={32} />
        <span className={`${SUBTITLE} flex-1`}>{chain.label}</span>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
            chain.sponsored ? "bg-emerald-300/10 text-emerald-200" : "bg-white/8 text-white/60"
          }`}
        >
          {chain.sponsored ? "We cover the fee" : "Fee from your balance"}
        </span>
      </div>
      <ul className="mt-3 flex flex-col divide-y divide-white/6 border-t border-white/6">
        {chain.assets.map((asset) => (
          <li key={asset.id} className="flex items-center justify-between py-2 text-[13.5px]">
            <span className="text-white/85 tabular-nums">
              {asset.amountText} {asset.symbol}
            </span>
            <span className="text-white/45 tabular-nums">{usd.format(asset.valueUsd)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

// Greyed out: visible so nothing looks lost, never selectable, never sent.
function LockedRow({ chain }: { chain: StuckView }) {
  return (
    <li
      data-disabled="true"
      className="pointer-events-none rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 opacity-40 select-none"
    >
      <div className="flex items-center gap-3">
        <NetworkIcon network={chain.network} size={28} />
        <span className="flex-1 text-[14px] font-medium">{chain.label}</span>
        <span className="text-[11px]">{chain.reason}</span>
      </div>
      <ul className="mt-2 flex flex-col gap-1 pl-10">
        {chain.assets.map((asset) => (
          <li key={asset.id} className="flex justify-between text-[12.5px] tabular-nums">
            <span>
              {asset.amountText} {asset.symbol}
            </span>
            <span>{usd.format(asset.valueUsd)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}
