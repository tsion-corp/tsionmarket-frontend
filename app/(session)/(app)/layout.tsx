import { AppShell } from "@/components/layout/app-shell";
import { getServerSession } from "@/lib/server/session";

// The signed-in product routes: dashboard, spot, perps, memecoins, real
// assets, prediction and activity. The group exists so these share one
// mounted shell (see components/layout/app-shell.tsx) while the landing page,
// auth, welcome and privacy stay outside it, and it adds nothing to the URL.
//
// The layout verifies the session cookie on the server and hands the result
// down, so the shell and the page can paint at the first byte instead of
// after Privy's browser SDK has started. A request with no valid cookie gets
// null, and the guard then waits for Privy exactly as it did before; the
// server never redirects here, because an expired access token with a live
// refresh token is a session Privy will restore in the browser, and a
// redirect would bounce it through /auth for nothing.
//
// Casino and earn are not in the group yet. Casino switches its chrome by
// route (the chess site shell, the bare board, or this shell) from inside the
// feature, and earn wraps its ten routes the same way; both keep mounting the
// shell per page until they are brought in on their own.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  return <AppShell session={session}>{children}</AppShell>;
}
