import type { WalletUpgradeConfig } from "@/lib/wallet-upgrade/environment";

/**
 * The upgrade as an ordered list of steps, each with a state the page can
 * render without knowing the rules. A step is only ever `ready` when everything
 * before it is done AND the service behind it is switched on; otherwise it says
 * which of the two is missing. Nothing is shown as possible that is not.
 */

export type StepId = "clerk" | "decane" | "link" | "wallet" | "recovery" | "funds";
export type StepState = "done" | "ready" | "blocked" | "unavailable";

export interface Step {
  id: StepId;
  title: string;
  description: string;
  state: StepState;
  /** Why it cannot be done yet. */
  reason?: string | undefined;
}

export interface UpgradeProgress {
  clerkSignedIn: boolean;
  decaneSignedIn: boolean;
  linked: boolean;
  /** Set up fresh, with no old account to bring across: those steps do not apply. */
  noLegacyAccount: boolean;
  walletCreated: boolean;
  recoveryConfirmed: boolean;
  fundsMoved: boolean;
}

export const EMPTY_PROGRESS: UpgradeProgress = {
  clerkSignedIn: false,
  decaneSignedIn: false,
  linked: false,
  noLegacyAccount: false,
  walletCreated: false,
  recoveryConfirmed: false,
  fundsMoved: false,
};

export function deriveSteps(config: WalletUpgradeConfig, progress: UpgradeProgress): Array<Step> {
  const defs: Array<{
    id: StepId;
    title: string;
    description: string;
    done: boolean;
    service: boolean;
    unavailableReason: string;
    needs: Array<{ ok: boolean; reason: string }>;
  }> = [
    {
      id: "clerk",
      title: "Sign in to your new account",
      description: "Your new sign-in, secured by Clerk.",
      done: progress.clerkSignedIn,
      service: true,
      unavailableReason: "",
      needs: [],
    },
    {
      id: "decane",
      title: "Sign in to your current account",
      description:
        "We need to see your existing wallet to move it. Nothing is changed by signing in.",
      done: progress.decaneSignedIn || progress.noLegacyAccount,
      service: true,
      unavailableReason: "",
      needs: [],
    },
    {
      id: "link",
      title: "Connect the two",
      description:
        "Proves both accounts are yours, so your balances, history and rewards carry over.",
      done: progress.linked,
      service: config.linkAvailable,
      unavailableReason: "The account-linking service is not switched on yet.",
      needs: [
        { ok: progress.clerkSignedIn, reason: "Sign in to your new account first." },
        { ok: progress.decaneSignedIn, reason: "Sign in to your current account first." },
      ],
    },
    {
      id: "wallet",
      title: "Create your own wallet",
      description: "Your keys are made and locked on this device with a passphrase only you know.",
      done: progress.walletCreated,
      service: config.walletAvailable,
      unavailableReason: "The wallet service is not switched on yet.",
      needs: [{ ok: progress.linked, reason: "Connect your accounts first." }],
    },
    {
      id: "recovery",
      title: "Save your recovery secret",
      description:
        "The only way back in if you forget your passphrase. We cannot recover it for you.",
      done: progress.recoveryConfirmed,
      service: config.walletAvailable,
      unavailableReason: "The wallet service is not switched on yet.",
      needs: [{ ok: progress.walletCreated, reason: "Create your wallet first." }],
    },
    {
      id: "funds",
      title: "Move your funds",
      description:
        "You see exactly what moves and where, then press one button. Your own wallet signs each transfer, and we cover the network fee where it is cheap.",
      done: progress.fundsMoved,
      service: config.moveFundsAvailable,
      unavailableReason: "Moving funds is not switched on yet.",
      needs: [{ ok: progress.recoveryConfirmed, reason: "Save your recovery secret first." }],
    },
  ];

  return defs.map((def): Step => {
    const base = { id: def.id, title: def.title, description: def.description };
    if (def.done) return { ...base, state: "done" };
    if (!def.service) return { ...base, state: "unavailable", reason: def.unavailableReason };
    const unmet = def.needs.find((need) => !need.ok);
    if (unmet) return { ...base, state: "blocked", reason: unmet.reason };
    return { ...base, state: "ready" };
  });
}

/** The one thing to do next, or null when everything is finished. */
export function nextStep(steps: ReadonlyArray<Step>): Step | null {
  return steps.find((step) => step.state !== "done") ?? null;
}
