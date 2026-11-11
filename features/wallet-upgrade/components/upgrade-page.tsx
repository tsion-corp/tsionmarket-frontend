"use client";

import { useState } from "react";
import Link from "next/link";
import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { openSignIn } from "@/hooks/use-sign-in";
import { UPGRADE_STATUS_KEY, getUpgradeStatus, linkAccounts, provisionAccount } from "../lib/api";
import type { WalletUpgradeConfig } from "@/lib/wallet-upgrade/environment";
import { linkErrorMessage } from "../lib/link-errors";
import { EMPTY_PROGRESS, deriveSteps, nextStep } from "../lib/steps";
import type { Step, StepState } from "../lib/steps";

/**
 * The wallet upgrade, start to finish, on one page.
 *
 * Clerk lands people here after they sign in, so this is also where the profile
 * button lives: the rest of the app still reads Decane, and a Clerk-only
 * session cannot use those pages yet. Decane stays mounted on purpose. It is
 * how a person proves the old wallet is theirs and how the move is signed.
 *
 * Only the steps that really work are active. The others say what they are
 * waiting on instead of looking clickable.
 */

const STATE_LABEL: Record<StepState, string> = {
  done: "Done",
  ready: "Ready",
  blocked: "Waiting",
  unavailable: "Not available yet",
};

const STATE_STYLE: Record<StepState, string> = {
  done: "bg-emerald-400/15 text-emerald-300",
  ready: "bg-white text-black",
  blocked: "bg-white/8 text-white/60",
  unavailable: "bg-white/6 text-white/40",
};

export function UpgradePage({ config }: { config: WalletUpgradeConfig }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-5 py-10 text-white">
      {config.blockedReason ? <Blocked config={config} /> : <Flow config={config} />}
    </main>
  );
}

function EnvironmentBadge({ config }: { config: WalletUpgradeConfig }) {
  const label =
    config.target === "development"
      ? "Development · rehearsal only, nothing real moves"
      : config.dryRun
        ? "Production · dry run"
        : "Production";
  const tone =
    config.target === "development" || config.dryRun
      ? "bg-amber-400/15 text-amber-200"
      : "bg-white/8 text-white/70";
  return (
    <span className={`self-start rounded-full px-3 py-1 text-[12px] font-medium ${tone}`}>
      {label}
    </span>
  );
}

function Blocked({ config }: { config: WalletUpgradeConfig }) {
  return (
    <>
      <EnvironmentBadge config={config} />
      <h1 className="font-serif text-3xl">Wallet upgrade is switched off</h1>
      <p
        role="alert"
        className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100"
      >
        {config.blockedReason}
      </p>
    </>
  );
}

function Flow({ config }: { config: WalletUpgradeConfig }) {
  const clerk = useAuth();
  const { user } = useUser();
  const decane = useAuthSession();
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: UPGRADE_STATUS_KEY,
    queryFn: getUpgradeStatus,
    enabled: config.linkAvailable && Boolean(clerk.isSignedIn),
    staleTime: 30_000,
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: UPGRADE_STATUS_KEY });
  const link = useMutation({ mutationFn: linkAccounts, onSuccess: refresh });
  const provision = useMutation({ mutationFn: provisionAccount, onSuccess: refresh });

  const progress = {
    ...EMPTY_PROGRESS,
    clerkSignedIn: Boolean(clerk.isSignedIn),
    decaneSignedIn: decane.authenticated,
    linked: status.data?.linked ?? false,
    noLegacyAccount: status.data?.method === "new_user",
  };
  const steps = deriveSteps(config, progress);
  const next = nextStep(steps);
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <EnvironmentBadge config={config} />
          <h1 className="font-serif text-3xl leading-tight">Upgrade to your own wallet</h1>
          <p className="max-w-md text-sm text-white/60">
            A wallet only you can open: locked on your device, with a recovery secret only you hold.
            Your current wallet stays as it is until you decide to move.
          </p>
        </div>
        {/* The profile. Shown as soon as Clerk has a session. */}
        <div className="flex shrink-0 flex-col items-end gap-1" data-testid="clerk-profile">
          {clerk.isLoaded && clerk.isSignedIn ? (
            <>
              <UserButton />
              {email ? (
                <span className="max-w-[10rem] truncate text-[11px] text-white/50">{email}</span>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <StepCard key={step.id} step={step} index={index + 1} />
        ))}
      </ol>

      <NextAction
        step={next}
        clerkReady={Boolean(clerk.isLoaded)}
        link={{ pending: link.isPending, error: link.error, run: () => link.mutate() }}
      />
      {config.linkAvailable &&
      clerk.isSignedIn &&
      !decane.authenticated &&
      status.isSuccess &&
      !status.data.linked ? (
        <StartFresh
          pending={provision.isPending}
          error={provision.error}
          run={() => provision.mutate()}
        />
      ) : null}
      {status.isError ? (
        <p role="alert" className="text-center text-xs text-white/50">
          {linkErrorMessage(status.error)}
        </p>
      ) : null}
    </>
  );
}

function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[13px] font-semibold">
        {step.state === "done" ? "✓" : index}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">{step.title}</h2>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATE_STYLE[step.state]}`}
          >
            {STATE_LABEL[step.state]}
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-white/55">{step.description}</p>
        {step.reason ? <p className="text-[12px] text-white/40">{step.reason}</p> : null}
      </div>
    </li>
  );
}

interface LinkAction {
  pending: boolean;
  error: unknown;
  run: () => void;
}

function NextAction({
  step,
  clerkReady,
  link,
}: {
  step: Step | null;
  clerkReady: boolean;
  link: LinkAction;
}) {
  if (!clerkReady) return null;
  if (!step) {
    return <p className="text-center text-sm text-emerald-300">Your upgrade is complete.</p>;
  }

  const button =
    "w-full rounded-full bg-white px-5 py-3 text-center text-[15px] font-semibold text-black transition-colors hover:bg-white/90";

  if (step.id === "clerk" && step.state === "ready") {
    return (
      <Link href="/sign-in" className={button}>
        Sign in to your new account
      </Link>
    );
  }
  if (step.id === "decane" && step.state === "ready") {
    return (
      <button type="button" onClick={openSignIn} className={button}>
        Sign in to your current account
      </button>
    );
  }
  if (step.id === "link" && step.state === "ready") {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={link.pending}
          onClick={link.run}
          className={`${button} disabled:opacity-60`}
        >
          {link.pending ? "Connecting…" : "Connect your two accounts"}
        </button>
        {link.error ? (
          <p role="alert" className="text-center text-sm text-red-200">
            {linkErrorMessage(link.error)}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <button type="button" disabled className={`${button} cursor-not-allowed opacity-40`}>
      {step.reason ?? "Not available yet"}
    </button>
  );
}

// For someone who has never used TsionMarket. Two steps on purpose: starting
// fresh can't be undone, and anyone who HAS an old account must connect it
// instead, or its balances can never be brought across.
function StartFresh({
  pending,
  error,
  run,
}: {
  pending: boolean;
  error: unknown;
  run: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-center text-[13px] text-white/50 underline underline-offset-4 hover:text-white/80"
      >
        I have never used TsionMarket before
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm">
      <p className="text-amber-100">
        Starting fresh means you can&apos;t connect an old account later. If you have ever signed in
        to TsionMarket before, sign in to that account above instead, or its balances can&apos;t be
        brought across.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={run}
          className="flex-1 rounded-full bg-white px-4 py-2.5 font-semibold text-black disabled:opacity-60"
        >
          {pending ? "Setting up…" : "Start fresh"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-full border border-white/20 px-4 py-2.5 text-white/80"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-red-200">
          {linkErrorMessage(error)}
        </p>
      ) : null}
    </div>
  );
}
