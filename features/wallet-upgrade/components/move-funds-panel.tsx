"use client";

import { useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import type { WalletUpgradeConfig } from "@/lib/wallet-upgrade/environment";
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

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const short = (value: string | null) => (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—");

const card = "flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5";
const primary =
  "w-full rounded-full bg-white px-5 py-3 text-center text-[15px] font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50";
const link =
  "self-center text-[13px] text-white/50 underline underline-offset-4 hover:text-white/80";

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
  const session = useAuthSession();
  const sources: Addresses = { evm: session.evmAddress, solana: session.solanaAddress };
  const matches = sourcesMatchLink(sources, linked);
  const scan = useMoveScan(sources, session.authenticated && matches);
  const run = useRunMove(sources);
  const [checked, setChecked] = useState(false);

  if (!session.authenticated) {
    return (
      <section className={card} aria-label="Move your funds">
        <h2 className="text-lg font-semibold">Move your funds</h2>
        <p className="text-[13px] text-white/60">
          Sign in to your current account to see what can move.
        </p>
      </section>
    );
  }
  if (!matches) {
    return (
      <section className={card} aria-label="Move your funds">
        <h2 className="text-lg font-semibold">Move your funds</h2>
        <p role="alert" className="text-sm text-amber-200">
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
    <section className={card} aria-label="Move your funds">
      <h2 className="text-lg font-semibold">Move your funds</h2>
      {config.dryRun ? (
        <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-[13px] text-amber-100">
          Rehearsal. Nothing will be sent. This shows exactly what would move.
        </p>
      ) : null}

      {scan.isPending ? (
        <p className="text-sm text-white/50">Checking your current wallet…</p>
      ) : null}
      {scan.isError ? (
        <p role="alert" className="text-sm text-red-200">
          {walletErrorMessage(scan.error)}
        </p>
      ) : null}

      {plan ? (
        <>
          {scan.data && scan.data.missing.length > 0 ? (
            <p className="text-[12px] text-amber-200">
              We couldn&apos;t read {scan.data.missing.length} network
              {scan.data.missing.length === 1 ? "" : "s"} just now, so this may be more than shown.
            </p>
          ) : null}

          {plan.view.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Will move">
              {plan.view.map((chain) => (
                <ChainRow key={chain.network} chain={chain} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-300">
              {result
                ? "All of it is across."
                : "There's nothing to move from the networks that are switched on."}
            </p>
          )}

          {plan.locked.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-[12px] tracking-wide text-white/40 uppercase">
                Not available yet
              </h3>
              <ul className="flex flex-col gap-2" aria-label="Not available yet">
                {plan.locked.map((chain) => (
                  <LockedRow key={chain.network} chain={chain} />
                ))}
              </ul>
            </div>
          ) : null}

          {plan.stuck.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-[12px] tracking-wide text-white/40 uppercase">
                Can&apos;t move from here
              </h3>
              <ul className="flex flex-col gap-2">
                {plan.stuck.map((chain) => (
                  <LockedRow key={chain.network} chain={chain} />
                ))}
              </ul>
            </div>
          ) : null}

          {!nothingToMove(plan) ? (
            <>
              <div className="flex items-center justify-between text-[14px]">
                <span className="text-white/60">Total to move</span>
                <span className="font-semibold">{usd.format(plan.totalUsd)}</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-[12px] text-white/60">
                <div className="mb-1 text-white/40">Goes to your new wallet</div>
                <div className="font-mono">Ethereum, Arbitrum: {short(destinations.evm)}</div>
                <div className="font-mono">Solana: {short(destinations.solana)}</div>
              </div>
              {problems.length > 0 ? (
                <p role="alert" className="text-sm text-red-200">
                  {problems[0]}
                </p>
              ) : (
                <label className="flex items-start gap-2 text-[13px] text-white/70">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                  />
                  These are my new wallet&apos;s addresses, the ones shown above.
                </label>
              )}
              <button
                type="button"
                className={primary}
                disabled={!checked || problems.length > 0 || run.isPending}
                onClick={() => run.mutate({ config, linked, destinations, plan })}
              >
                {run.isPending
                  ? "Moving…"
                  : config.dryRun
                    ? "Rehearse the move"
                    : `Move ${usd.format(plan.totalUsd)} to my new wallet`}
              </button>
            </>
          ) : null}
        </>
      ) : null}

      {run.error ? (
        <p role="alert" className="text-sm text-red-200">
          {run.error.message || walletErrorMessage(run.error)}
        </p>
      ) : null}

      {result ? (
        <div
          role="status"
          className={`rounded-xl px-3 py-2 text-[13px] ${result.failed ? "bg-amber-400/15 text-amber-100" : "bg-emerald-400/15 text-emerald-200"}`}
        >
          {config.dryRun ? "Rehearsal: " : ""}
          {result.moved} moved{result.failed ? `, ${result.failed} didn't` : ""} (
          {usd.format(result.usdMoved)}).
          {result.failed && result.firstError ? ` ${result.firstError}` : ""}
          {result.failed && result.retryable ? " You can try again." : ""}
        </div>
      ) : null}

      <button
        type="button"
        className={link}
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
    <li className="rounded-xl border border-white/10 bg-black/30 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium">{chain.label}</span>
        <span className="text-[11px] text-white/50">
          {chain.sponsored ? "We cover the fee" : "Fee comes from your balance"}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {chain.assets.map((asset) => (
          <li key={asset.id} className="flex justify-between text-[13px] text-white/80">
            <span>
              {asset.amountText} {asset.symbol}
            </span>
            <span className="text-white/50">{usd.format(asset.valueUsd)}</span>
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
      className="pointer-events-none rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-3 opacity-40 select-none"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium">{chain.label}</span>
        <span className="text-[11px]">{chain.reason}</span>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {chain.assets.map((asset) => (
          <li key={asset.id} className="flex justify-between text-[13px]">
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
