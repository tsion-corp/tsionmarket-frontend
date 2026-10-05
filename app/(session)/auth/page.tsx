"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wordmark } from "@/components/ui/wordmark";
import { returnPathFrom } from "@/lib/return-to";
import { VisualPanel } from "@/components/auth/visual-panel";
import { SignInPanel } from "@/components/auth/sign-in-panel";

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Where they were headed before sign-in took over, when it is ours to go to.
  const returnTo = returnPathFrom(searchParams?.toString() ?? "");
  // A link they followed wins over the default landing: someone handed a game
  // at an event should reach the game.
  const onSignedIn = useCallback(
    () => router.replace(returnTo ?? "/dashboard"),
    [router, returnTo]
  );

  return (
    <div className="grid min-h-screen grid-cols-1 bg-black lg:grid-cols-[1fr_1.05fr]">
      <div className="relative flex min-h-screen flex-col p-5 sm:px-10 sm:py-8">
        <div className="self-center md:self-start">
          <Wordmark />
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-start pt-8 pb-9 md:justify-center md:py-12">
          <SignInPanel variant="page" onSignedIn={onSignedIn} />
        </div>
      </div>
      <VisualPanel />
    </div>
  );
}
