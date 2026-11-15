import { SignUp } from "@clerk/nextjs";
import { notFound } from "next/navigation";
import { readUpgradeEnv, walletUpgradeConfig } from "@/lib/wallet-upgrade/environment";
import { Suspense } from "react";

export default function SignUpPage() {
  // These pages exist only where Clerk is configured.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) notFound();
  // While the wallet upgrade is on, a new Clerk session lands there: the rest
  // of the app still reads Decane and cannot use a Clerk-only session yet.
  const landing = walletUpgradeConfig(readUpgradeEnv()).enabled ? "/upgrade" : "/";
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense>
        <SignUp fallbackRedirectUrl={landing} />
      </Suspense>
    </div>
  );
}
