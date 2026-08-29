"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { markKnownUser } from "@/lib/known-user";
import { Topbar } from "@/components/layout/topbar";
import { AccountModal } from "@/components/layout/modals/account-modal";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { ConnectionBanner } from "@/components/layout/connection-banner";
import { SupportButton } from "@/components/layout/support-button";
import { BroadcastDock } from "@/components/broadcast/broadcast-dock";
import { FeatureMarquee } from "@/components/layout/feature-marquee";
import { ModalShell } from "@/components/ui/modal-shell";
import { FundsModal } from "@/features/funds";
import { InviteFriendsModal, useClaimReferralFromLink } from "@/features/referrals";
import { usePrefetchDepositCatalog } from "@/hooks/use-catalog-prefetch";
import { useAppNavigate } from "@/hooks/use-app-navigate";
import type { NavItem } from "@/components/layout/nav-items";
import type { SectionId } from "@/lib/sections";

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
  // Funding from the phone tab bar's round button. The shell owns this one so
  // the action works on every page, not just the dashboard, which keeps its own
  // copy for the balance card and the empty states.
  const [fundsOpen, setFundsOpen] = useState(false);
  // The marquee's invite item opens the same Invite Friends modal the account
  // menu reaches; the shell owns an instance so the item works on every page.
  const [inviteOpen, setInviteOpen] = useState(false);

  // Anyone rendering the shell has an account, including sessions that
  // predate the flag — so the landing page can greet them with "Log in".
  useEffect(() => {
    markKnownUser();
  }, []);

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
        onOpenAccount={() => setAccountOpen(true)}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      {/* The tab bar sits at the bottom on a phone, so the last section needs
          room to clear it. While a broadcast is running the dock adds its own
          bar above the tab bar, which the root's --ws-live-bar variable
          reserves, so the live indicator compresses the page instead of
          covering the last row of it. */}
      <main className="min-h-screen pb-[calc(92px+var(--ws-live-bar,0px))] md:ml-[248px] md:pb-[var(--ws-live-bar,0px)]">
        <div className="sticky top-0 z-[60]">
          <Topbar onOpenAccount={() => setAccountOpen(true)} />
          <FeatureMarquee
            navIds={nav.map((n) => n.id)}
            onNavigate={navigate}
            onAddFunds={() => setFundsOpen(true)}
            onInvite={() => setInviteOpen(true)}
          />
        </div>

        {children}
      </main>

      {/* One sentence for the whole app when the server is unreachable — see
          the note in the component for why it is not one per panel. */}
      <ConnectionBanner />

      <MobileTabBar
        items={nav}
        activeSection={activeSection}
        onNavigate={navigate}
        onOpenMore={() => setMenuOpen(true)}
        onAddFunds={() => setFundsOpen(true)}
      />

      {/* The live indicator and the minimised self-view. Docked, never
          floating over content: the dock reserves its own height so the page
          is compressed rather than covered. */}
      <BroadcastDock />

      <SupportButton />

      <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <ModalShell open={accountOpen} onClose={() => setAccountOpen(false)}>
        <AccountModal onClose={() => setAccountOpen(false)} />
      </ModalShell>

      <ModalShell open={fundsOpen} onClose={() => setFundsOpen(false)} size="lg">
        <FundsModal onClose={() => setFundsOpen(false)} />
      </ModalShell>
    </div>
  );
}
