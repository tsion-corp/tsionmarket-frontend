import { ClerkScope } from "@/components/auth/clerk-scope";
import { authMode, readUpgradeEnv } from "@/lib/wallet-upgrade/environment";

// Clerk only where it is the sign-in. With Decane (the default) the page needs none
// of Clerk's code.
export default function Layout({ children }: { children: React.ReactNode }) {
  if (authMode(readUpgradeEnv()) !== "clerk") return <>{children}</>;
  return <ClerkScope>{children}</ClerkScope>;
}
