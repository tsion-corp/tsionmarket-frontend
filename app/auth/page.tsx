"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Wordmark } from "@/components/ui/wordmark";
import { LockIcon } from "@/components/ui/icons";
import { SocialButtons } from "@/components/auth/social-buttons";
import { EmailForm } from "@/components/auth/email-form";
import { PasskeyButton } from "@/components/auth/passkey-button";
import { VisualPanel } from "@/components/auth/visual-panel";
import { useEnsureWallets } from "@/hooks/use-ensure-wallets";
import { hasEmbeddedWallet } from "@/lib/user";

export default function AuthPage() {
  const { ready, authenticated, user } = usePrivy();
  const ensureWallets = useEnsureWallets();
  const router = useRouter();
  const handled = useRef(false);

  // Runs after any login completes (OAuth redirect return, email code, wallet)
  // and for already-signed-in visitors. First-time users have no embedded
  // wallet yet, so they get onboarding; everyone else goes straight in.
  useEffect(() => {
    if (!ready || !authenticated || !user || handled.current) return;
    handled.current = true;
    const firstTime = !hasEmbeddedWallet(user, "ethereum");
    ensureWallets(user).then(() => router.replace(firstTime ? "/interests" : "/dashboard"));
  }, [ready, authenticated, user, ensureWallets, router]);

  const signingIn = ready && authenticated;

  return (
    <div className="grid min-h-screen grid-cols-1 bg-black lg:grid-cols-[1fr_1.05fr]">
      <div className="relative flex min-h-screen flex-col p-5 sm:px-10 sm:py-8">
        <div className="self-start">
          <Wordmark />
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-9 sm:py-12">
          <div className="mb-[26px] inline-flex items-center gap-[9px] self-start rounded-full border border-white/14 bg-white/6 py-[5px] pr-3.5 pl-1.5">
            <span className="text-ink rounded-full bg-white px-2.5 py-[3px] text-[11px] font-semibold">
              Beta
            </span>
            <span className="pr-1 text-[13px] text-white/90">Early access is open</span>
          </div>

          <h1 className="ws-display text-[clamp(38px,4.6vw,56px)] leading-none tracking-[-0.03em]">
            Welcome to <span className="text-accent">World Street</span>
          </h1>
          <p className="mt-4 max-w-[38ch] text-[15.5px] leading-[1.55] text-white/72">
            Sign in to own stocks, gold, crypto and real-world assets from one self-custody account.
          </p>

          {signingIn ? (
            <div className="mt-[34px] flex items-center gap-3 rounded-[14px] border border-white/14 bg-white/6 p-4">
              <span className="grid h-8 w-8 animate-pulse place-items-center rounded-full border border-white/18 bg-white/8">
                <span className="ws-display text-accent text-[17px] leading-none">w</span>
              </span>
              <span className="text-sm text-white/80">
                Signing you in and setting up your wallet…
              </span>
            </div>
          ) : (
            <>
              <div className="mt-[34px]">
                <SocialButtons />
              </div>

              <div className="my-[22px] flex items-center gap-3.5">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-xs tracking-[0.04em] text-white/40">OR</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <EmailForm />

              <PasskeyButton />
            </>
          )}

          <div className="mt-[26px] flex items-center gap-2 text-xs text-white/40">
            <LockIcon className="text-white/40" />
            Secured &amp; self-custodial · Protected by{" "}
            <span className="font-medium text-white/70">Privy</span>
          </div>
        </div>

        <p className="mx-auto max-w-[420px] text-center text-xs leading-normal text-white/35">
          By continuing you agree to World Street&apos;s{" "}
          <a href="#" className="text-white/60 underline">
            Terms
          </a>{" "}
          and{" "}
          <a href="#" className="text-white/60 underline">
            Privacy Policy
          </a>
          .
        </p>
      </div>

      <VisualPanel />
    </div>
  );
}
