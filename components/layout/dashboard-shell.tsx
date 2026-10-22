"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { markKnownUser } from "@/lib/known-user";
import { Topbar } from "@/components/layout/topbar";
import { AccountModal } from "@/components/layout/modals/account-modal";
import { CurvedTabBar } from "@/components/layout/curved-tab-bar";
import { ConnectionBanner } from "@/components/layout/connection-banner";
import { SupportButton } from "@/components/layout/support-button";
import { ModalShell } from "@/components/ui/modal-shell";
import { ModalLoading } from "@/components/layout/modals/modal-loading";
import { PortfolioFab } from "@/features/portfolio/components/portfolio-fab";
import { useClaimReferralFromLink } from "@/features/referrals";
import { usePrefetchDepositCatalog } from "@/hooks/use-catalog-prefetch";
import { useAppNavigate } from "@/hooks/use-app-navigate";
import { useRequireSession } from "@/hooks/use-require-session";
import { useAddFunds } from "@/hooks/use-funds-modal";
import { useSignedIn } from "@/hooks/use-signed-in";
import type { NavItem } from "@/components/layout/nav-items";
import type { SectionId } from "@/lib/sections";

// Dynamic, as AppModalHost loads it: statically it would put the whole
// withdraw surface into every route's first load.
const WithdrawModal = dynamic(
  () => import("@/features/funds/components/withdraw-modal").then((m) => m.WithdrawModal),
  { ssr: false, loading: () => <ModalLoading /> }
);
interface DashboardShellProps {
  nav: NavItem[];
  activeSection: SectionId;
  children: React.ReactNode;
}

// The persistent chrome around every top-level app screen: sidebar (a drawer
// on phones), topbar, the phone tab bar, and the account modal. Shared by /dashboard
// (the scroll-spy sections) and any standalone section page like /casino, so
// moving between them feels like one app, not a different shell per page.
//
// Every nav target is dispatched through one function: "casino" is a real
// route, so it always navigates there; everything else is a scroll-spy
// anchor that only exists on /dashboard, so it scrolls in-page when already
// there and otherwise navigates to /dashboard#id first.
export function DashboardShell({ nav, activeSection, children }: DashboardShellProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const addFunds = useAddFunds();
  const requireSession = useRequireSession();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  // Visitors see the shell too now, so only a real session marks a known user
  // (the landing page greets those with "Log in").
  const signedIn = useSignedIn() === "yes";
  useEffect(() => {
    if (signedIn) markKnownUser();
  }, [signedIn]);

  // Warm the deposit network/token catalog into the store as soon as the user
  // is on the platform, on any page — so "Add funds" always opens with
  // networks already loaded rather than fetching (and often showing nothing)
  // on click.
  usePrefetchDepositCatalog();

  // If the session arrived through an /r/<username> invite link, settle the
  // referral claim once and clear the cookie.
  useClaimReferralFromLink();

  const navigate = useAppNavigate();

  return (
    <div className="min-h-screen bg-black">
      <Sidebar
        items={nav}
        activeSection={activeSection}
        onNavigate={(id) => navigate(id)}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      {/* The tab bar sits at the bottom on a phone, so the last section needs
          room to clear it. */}
      <main className="min-h-screen pb-[92px] md:ml-[248px] md:pb-0">
        <div className="sticky top-0 z-[60]">
          <Topbar onOpenAccount={() => setAccountOpen(true)} />
        </div>

        {children}
      </main>
      {/* One sentence for the whole app when the server is unreachable — see
          the note in the component for why it is not one per panel. */}
      <ConnectionBanner />

      <CurvedTabBar items={nav} activeSection={activeSection} onNavigate={navigate} />

      <SupportButton />

      <PortfolioFab
        onOpenFunds={addFunds}
        onOpenWithdraw={() => {
          if (requireSession("withdraw")) setWithdrawOpen(true);
        }}
      />

      <ModalShell open={accountOpen} onClose={() => setAccountOpen(false)}>
        <AccountModal onClose={() => setAccountOpen(false)} />
      </ModalShell>

      <ModalShell open={withdrawOpen} onClose={() => setWithdrawOpen(false)} size="lg">
        <WithdrawModal onClose={() => setWithdrawOpen(false)} />
      </ModalShell>
    </div>
  );
}
