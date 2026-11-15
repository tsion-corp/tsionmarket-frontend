"use client";

import { useState } from "react";
import Link from "next/link";
import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountAvatar } from "@/components/ui/account-avatar";
import { ArkMark } from "@/components/ui/ark-mark";
import { BRAND } from "@/lib/brand";
import { ArrowRightIcon, CheckIcon, LockIcon, ShieldIcon, WalletIcon } from "@/components/ui/icons";
import { useAuthSession } from "@/hooks/use-auth-session";
import { openSignIn } from "@/hooks/use-sign-in";
import type { WalletUpgradeConfig } from "@/lib/wallet-upgrade/environment";
import { useDecaneAccount } from "../hooks/use-decane-account";
import { useMoveScan } from "../hooks/use-move-funds";
import { UPGRADE_STATUS_KEY, getUpgradeStatus, linkAccounts, provisionAccount } from "../lib/api";
import { linkErrorMessage } from "../lib/link-errors";
import { destinationsFromWallet, nothingToMove, sourcesMatchLink } from "../lib/move-funds";
import { EMPTY_PROGRESS, deriveSteps, nextStep, type Step } from "../lib/steps";
import { addressesOf } from "../lib/wallet-flow";
import { MoveFundsPanel } from "./move-funds-panel";
import { KICKER, LINK, NOTICE, PANEL, PRIMARY, SECONDARY, SMALL, TITLE, BODY } from "./ui";
import { UpgradeStepper, shortLabel } from "./upgrade-stepper";
import { WalletPanel, useWalletState } from "./wallet-panel";

/**
 * The wallet upgrade, start to finish, on one page.
 *
 * One thing to do at a time: the rail shows where you are, the card beside it
 * shows only the current step. Clerk lands people here after they sign in, so
 * this is also where the profile button lives. Decane stays mounted on purpose:
 * it is how a person proves the old wallet is theirs and how the move is signed.
 *
 * Only the steps that really work are active; the others say what they wait on.
 */

export function UpgradePage({ config }: { config: WalletUpgradeConfig }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* A soft light from above, so the page has depth without a picture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(70%_100%_at_50%_0%,rgba(212,212,216,0.14),transparent_72%)]"
      />
      <div className="relative mx-auto w-full max-w-[1080px] px-5 pt-6 pb-24 sm:px-8 lg:pt-9">
        {config.blockedReason ? (
          <Blocked config={config} />
        ) : config.auth === "clerk" ? (
          <Flow config={config} />
        ) : (
          <DecaneFlow config={config} />
        )}
      </div>
    </main>
  );
}

function EnvironmentPill({ config }: { config: WalletUpgradeConfig }) {
  const rehearsal = config.target === "development" || config.dryRun;
  // Long on a wide screen, a word on a phone, where the logo needs the room.
  const [long, short] =
    config.target === "development"
      ? ["Development · nothing real moves", "Rehearsal"]
      : config.dryRun
        ? ["Production · dry run", "Dry run"]
        : ["Production", "Live"];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium whitespace-nowrap ${
        rehearsal
          ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
          : "border-white/12 bg-white/5 text-white/70"
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${rehearsal ? "bg-amber-300" : "bg-emerald-300"}`}
      />
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{long}</span>
    </span>
  );
}

function TopBar({ config, right }: { config: WalletUpgradeConfig; right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <ArkMark height={20} />
        <span className="hidden h-4 w-px bg-white/15 sm:block" />
        <span className="hidden text-[13px] text-white/45 sm:block">Wallet upgrade</span>
      </div>
      <div className="flex items-center gap-3">
        <EnvironmentPill config={config} />
        {right}
      </div>
    </header>
  );
}

function Blocked({ config }: { config: WalletUpgradeConfig }) {
  return (
    <>
      <TopBar config={config} />
      <div className="mx-auto mt-24 max-w-md text-center">
        <h1 className={TITLE}>The wallet upgrade is switched off</h1>
        <p role="alert" className={`${NOTICE.error} mt-6 text-left`}>
          {config.blockedReason}
        </p>
      </div>
    </>
  );
}

const TRUST = [
  {
    icon: LockIcon,
    title: "Locked on your device",
    text: "Your keys are made here and sealed with a passphrase only you know.",
  },
  {
    icon: ShieldIcon,
    title: "We can't touch your funds",
    text: "We never see your keys, so we have nothing that could move your money.",
  },
  {
    icon: WalletIcon,
    title: "Nothing changes until you say",
    text: "Your current wallet stays exactly as it is until you press move.",
  },
] as const;

function Trust() {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {TRUST.map(({ icon: Icon, title, text }) => (
        <li
          key={title}
          className="flex flex-col gap-2.5 rounded-2xl border border-white/8 bg-white/[0.025] p-4"
        >
          <span className="grid size-8 place-items-center rounded-full bg-white/8 text-white/80">
            <Icon size={15} />
          </span>
          <div className="text-[14px] font-medium text-white">{title}</div>
          <p className="text-[12.5px] leading-snug text-white/50">{text}</p>
        </li>
      ))}
    </ul>
  );
}

function Flow({ config }: { config: WalletUpgradeConfig }) {
  const clerk = useAuth();
  const { user } = useUser();
  const decane = useAuthSession();
  const decaneAccount = useDecaneAccount();
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

  const uid = status.data?.uid ?? null;
  const wallet = useWalletState(uid, config.walletAvailable && Boolean(status.data?.linked));
  const hasWallet = wallet.data ? wallet.data.kind !== "none" : false;
  const newWallet = wallet.data && wallet.data.kind !== "none" ? wallet.data.wallet : null;
  const destinations = newWallet ? destinationsFromWallet(addressesOf(newWallet)) : null;

  // The funds step is done once nothing is left to move, never from a rehearsal.
  const linkedAddresses = status.data?.legacy ?? null;
  const sources = { evm: decaneAccount.evmAddress, solana: decaneAccount.solanaAddress };
  const moveScan = useMoveScan(
    sources,
    config.moveFundsAvailable &&
      hasWallet &&
      decane.authenticated &&
      sourcesMatchLink(sources, linkedAddresses)
  );
  const fundsMoved =
    !config.dryRun && moveScan.data !== undefined && nothingToMove(moveScan.data.plan);

  const progress = {
    ...EMPTY_PROGRESS,
    walletCreated: hasWallet,
    // A wallet is only saved after the recovery secret was written down and checked.
    recoveryConfirmed: hasWallet,
    fundsMoved,
    clerkSignedIn: Boolean(clerk.isSignedIn),
    decaneSignedIn: decane.authenticated,
    linked: status.data?.linked ?? false,
    noLegacyAccount: status.data?.method === "new_user",
  };
  const steps = deriveSteps(config, progress);
  const next = nextStep(steps);
  const email = user?.primaryEmailAddress?.emailAddress;

  // Until Clerk and the link status have answered, the steps would flash "sign
  // in" for someone who is already signed in. Show a placeholder instead.
  const loading =
    !clerk.isLoaded ||
    (config.linkAvailable && Boolean(clerk.isSignedIn) && status.isPending) ||
    (Boolean(status.data?.linked) && config.walletAvailable && wallet.isPending);

  const showStartFresh =
    config.linkAvailable &&
    clerk.isSignedIn &&
    !decane.authenticated &&
    status.isSuccess &&
    !status.data.linked;

  const stepNumber = next ? steps.findIndex((s) => s.id === next.id) + 1 : steps.length;
  // The wallet card stays on screen once it exists, as a quiet summary beside
  // whatever the current step is.
  const walletIsFocus = next?.id === "wallet" || next?.id === "recovery";
  const showWalletBelow = hasWallet && !walletIsFocus && Boolean(uid);

  return (
    <Layout
      config={config}
      steps={steps}
      next={next}
      right={
        <div className="flex items-center gap-2.5" data-testid="clerk-profile">
          {clerk.isLoaded && clerk.isSignedIn ? (
            <>
              {email ? (
                <span className="hidden max-w-[11rem] truncate text-[12.5px] text-white/50 md:block">
                  {email}
                </span>
              ) : null}
              <UserButton />
            </>
          ) : null}
        </div>
      }
    >
      {loading ? (
        <Skeleton />
      ) : (
        <>
          <Focus
            config={config}
            step={next}
            stepNumber={stepNumber}
            total={steps.length}
            uid={uid}
            link={{ pending: link.isPending, error: link.error, run: () => link.mutate() }}
            moveFunds={
              config.moveFundsAvailable && hasWallet && destinations && decane.authenticated ? (
                <MoveFundsPanel
                  config={config}
                  linked={linkedAddresses}
                  destinations={destinations}
                />
              ) : null
            }
          />
          {next && ["clerk", "decane", "link"].includes(next.id) ? <Trust /> : null}
          {showStartFresh ? (
            <StartFresh
              pending={provision.isPending}
              error={provision.error}
              run={() => provision.mutate()}
            />
          ) : null}
          {showWalletBelow && uid ? <WalletPanel uid={uid} /> : null}
          {status.isError ? (
            <p role="alert" className={NOTICE.warn}>
              {linkErrorMessage(status.error)}
            </p>
          ) : null}
        </>
      )}
    </Layout>
  );
}

/**
 * The upgrade with Decane as the one sign-in (the default). There is a single
 * account: the Decane session already carries the platform id, so the wallet
 * service reads it directly and nothing needs linking.
 */
function DecaneFlow({ config }: { config: WalletUpgradeConfig }) {
  const session = useAuthSession();
  const account = useDecaneAccount();
  const uid = session.userId;

  const wallet = useWalletState(uid, config.walletAvailable && session.authenticated);
  const hasWallet = wallet.data ? wallet.data.kind !== "none" : false;
  const newWallet = wallet.data && wallet.data.kind !== "none" ? wallet.data.wallet : null;
  const destinations = newWallet ? destinationsFromWallet(addressesOf(newWallet)) : null;

  // What is read and what is spent are the same Decane session, so there is no
  // second account to compare it against.
  const sources = { evm: account.evmAddress, solana: account.solanaAddress };
  const moveScan = useMoveScan(
    sources,
    config.moveFundsAvailable && hasWallet && session.authenticated
  );
  const fundsMoved =
    !config.dryRun && moveScan.data !== undefined && nothingToMove(moveScan.data.plan);

  const steps = deriveSteps(config, {
    ...EMPTY_PROGRESS,
    decaneSignedIn: session.authenticated,
    walletCreated: hasWallet,
    // A wallet is only saved after the recovery secret was written down and checked.
    recoveryConfirmed: hasWallet,
    fundsMoved,
  });
  const next = nextStep(steps);
  const stepNumber = next ? steps.findIndex((s) => s.id === next.id) + 1 : steps.length;

  const loading =
    !session.ready || (session.authenticated && config.walletAvailable && wallet.isPending);
  const walletIsFocus = next?.id === "wallet" || next?.id === "recovery";
  const showWalletBelow = hasWallet && !walletIsFocus && Boolean(uid);

  return (
    <Layout
      config={config}
      steps={steps}
      next={next}
      right={session.authenticated ? <AccountChip session={session} /> : null}
    >
      {loading ? (
        <Skeleton />
      ) : (
        <>
          <Focus
            config={config}
            step={next}
            stepNumber={stepNumber}
            total={steps.length}
            uid={uid}
            link={{ pending: false, error: null, run: () => undefined }}
            moveFunds={
              config.moveFundsAvailable && hasWallet && destinations && session.authenticated ? (
                <MoveFundsPanel config={config} linked={sources} destinations={destinations} />
              ) : null
            }
          />
          {next?.id === "decane" ? <Trust /> : null}
          {showWalletBelow && uid ? <WalletPanel uid={uid} /> : null}
        </>
      )}
    </Layout>
  );
}

function AccountChip({ session }: { session: ReturnType<typeof useAuthSession> }) {
  const label = session.profile.name || session.profile.email;
  return (
    <div className="flex items-center gap-2.5" data-testid="account-chip">
      <AccountAvatar
        seed={session.userId ?? session.evmAddress ?? "account"}
        name={label}
        size={28}
      />
      {label ? (
        <span className="hidden max-w-[11rem] truncate text-[12.5px] text-white/60 md:block">
          {label}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => void session.logout()}
        className="text-[12.5px] text-white/45 underline underline-offset-4 transition-colors hover:text-white"
      >
        Sign out
      </button>
    </div>
  );
}

/** The frame both flows share: the rail on the left, the current step on the right. */
function Layout({
  config,
  steps,
  next,
  right,
  children,
}: {
  config: WalletUpgradeConfig;
  steps: ReadonlyArray<Step>;
  next: Step | null;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar config={config} right={right} />

      <div className="mt-9 grid gap-9 lg:mt-14 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16">
        <aside className="flex flex-col gap-8 lg:sticky lg:top-10 lg:self-start">
          <div className="flex flex-col gap-4">
            <div className={KICKER}>Wallet upgrade</div>
            <h1 className="ws-display text-[34px] leading-[1.04] tracking-[-0.03em] sm:text-[42px] lg:text-[40px]">
              A wallet only <span className="text-white/55">you</span> can open.
            </h1>
            <p className={BODY}>
              Move to a wallet whose keys are made and locked on your device. It takes a few
              minutes, and you stay in control the whole way.
            </p>
          </div>

          <UpgradeStepper steps={steps} currentId={next?.id ?? null} auth={config.auth} />
        </aside>

        <section className="flex min-w-0 flex-col gap-5" aria-live="polite">
          {children}
        </section>
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div className={`${PANEL} animate-pulse`} aria-busy aria-label="Loading">
      <div className="h-3 w-24 rounded-full bg-white/10" />
      <div className="h-8 w-2/3 rounded-xl bg-white/10" />
      <div className="h-4 w-full rounded-full bg-white/8" />
      <div className="h-4 w-4/5 rounded-full bg-white/8" />
      <div className="mt-4 h-12 w-full rounded-full bg-white/10" />
    </div>
  );
}

interface LinkAction {
  pending: boolean;
  error: unknown;
  run: () => void;
}

function Focus({
  config,
  step,
  stepNumber,
  total,
  uid,
  link,
  moveFunds,
}: {
  config: WalletUpgradeConfig;
  step: Step | null;
  stepNumber: number;
  total: number;
  uid: string | null;
  link: LinkAction;
  moveFunds: React.ReactNode;
}) {
  if (!step) return <Complete config={config} />;

  // The wallet and the funds have their own panels, which carry their own
  // headings; the step only adds a small line of context above them.
  if (step.state === "ready" && (step.id === "wallet" || step.id === "recovery") && uid) {
    return (
      <>
        <Context stepNumber={stepNumber} total={total} step={step} />
        <WalletPanel uid={uid} />
      </>
    );
  }
  if (step.state === "ready" && step.id === "funds" && moveFunds) {
    return (
      <>
        <Context stepNumber={stepNumber} total={total} step={step} />
        {moveFunds}
      </>
    );
  }

  return (
    <article className={PANEL}>
      <div className="flex flex-col gap-3">
        <div className={KICKER}>
          Step {stepNumber} of {total}
        </div>
        <h2 className={TITLE}>{step.title}</h2>
        <p className={BODY}>{step.description}</p>
      </div>
      <Action step={step} link={link} />
    </article>
  );
}

function Context({ stepNumber, total, step }: { stepNumber: number; total: number; step: Step }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className={KICKER}>
        Step {stepNumber} of {total}
      </span>
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-[12.5px] text-white/45">{shortLabel(step.id)}</span>
    </div>
  );
}

function Action({ step, link }: { step: Step; link: LinkAction }) {
  if (step.state !== "ready") {
    return (
      <div
        className={`${SMALL} rounded-2xl border border-dashed border-white/12 px-4 py-3.5 text-[13.5px]`}
      >
        {step.reason ?? "Not available yet."}
      </div>
    );
  }
  if (step.id === "clerk") {
    return (
      <Link href="/sign-in" className={PRIMARY}>
        Sign in to your new account <ArrowRightIcon size={15} />
      </Link>
    );
  }
  if (step.id === "decane") {
    return (
      <button type="button" onClick={openSignIn} className={PRIMARY}>
        {step.title} <ArrowRightIcon size={15} />
      </button>
    );
  }
  if (step.id === "link") {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" disabled={link.pending} onClick={link.run} className={PRIMARY}>
          {link.pending ? "Connecting…" : "Connect your two accounts"}
        </button>
        {link.error ? (
          <p role="alert" className={NOTICE.error}>
            {linkErrorMessage(link.error)}
          </p>
        ) : null}
      </div>
    );
  }
  return null;
}

function Complete({ config }: { config: WalletUpgradeConfig }) {
  return (
    <article className={`${PANEL} items-center text-center`}>
      <span className="bg-upgrade text-ink grid size-14 place-items-center rounded-full">
        <CheckIcon size={26} />
      </span>
      <h2 className={TITLE}>Your upgrade is complete</h2>
      <p className={`${BODY} max-w-sm`}>
        {config.dryRun
          ? "That was a rehearsal: nothing was sent."
          : "Your wallet is yours alone now, and your funds are in it."}
      </p>
      <Link href="/" className={`${SECONDARY} max-w-xs`}>
        Back to your account
      </Link>
    </article>
  );
}

// For someone who has never used the app. Two steps on purpose: starting fresh
// can't be undone, and anyone who HAS an old account must connect it instead,
// or its balances can never be brought across.
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
      <button type="button" onClick={() => setConfirming(true)} className={`${LINK} self-start`}>
        I have never used {BRAND} before
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className={NOTICE.warn}>
        Starting fresh means you can&apos;t connect an old account later. If you have ever signed in
        before, sign in to that account above instead, or its balances can&apos;t be brought across.
      </p>
      <div className="flex gap-3">
        <button type="button" disabled={pending} onClick={run} className={PRIMARY}>
          {pending ? "Setting up…" : "Start fresh"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={SECONDARY}>
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" className={NOTICE.error}>
          {linkErrorMessage(error)}
        </p>
      ) : null}
    </div>
  );
}
