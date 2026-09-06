"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AppChromeProvider, useAppChrome } from "@/components/layout/app-chrome";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ServerSessionProvider } from "@/components/providers/server-session";
import type { ServerSession } from "@/lib/session";

function Shell({ children }: { children: React.ReactNode }) {
  const { nav, activeSection } = useAppChrome();
  return (
    <DashboardShell nav={nav} activeSection={activeSection}>
      {children}
    </DashboardShell>
  );
}

/**
 * The chrome around every signed-in product route: the auth guard and the
 * app shell, mounted once by the (app) layout.
 *
 * Until this existed each page mounted the shell itself, so moving from the
 * dashboard to the perps desk tore down and rebuilt the sidebar, the topbar,
 * the tab bar, the funds modal and the broadcast dock, then re-ran every
 * effect in them: the catalog prefetch, the referral claim, the known-user
 * mark. The shell's own comment said it made the pages "feel like one app";
 * mounted per page it could not. Under a layout it survives navigation, and
 * only the route's own content changes.
 *
 * `session` is what the layout verified from the cookie on the server. With
 * it the guard lets the page show before Privy's browser SDK is ready, and
 * hooks that need a wallet address have one to build their query keys from
 * in the meantime. Without it the guard waits for Privy as it always did.
 */
export function AppShell({
  session,
  children,
}: {
  session: ServerSession | null;
  children: React.ReactNode;
}) {
  return (
    <ServerSessionProvider session={session}>
      <AuthGuard serverVerified={session !== null}>
        <AppChromeProvider>
          <Shell>{children}</Shell>
        </AppChromeProvider>
      </AuthGuard>
    </ServerSessionProvider>
  );
}
