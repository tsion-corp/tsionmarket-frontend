"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { SectionChips } from "@/components/dashboard/section-chips";
import { DashboardFooter } from "@/components/dashboard/dashboard-footer";
import { AccountModal } from "@/components/dashboard/modals/account-modal";
import { ModalShell } from "@/components/ui/modal-shell";
import { usePrefetchDepositCatalog } from "@/hooks/use-catalog-prefetch";
import { scrollToSection } from "@/lib/scroll";
import type { NavItem } from "@/components/dashboard/nav-items";
import type { SectionId } from "@/lib/sections";

interface DashboardShellProps {
  nav: NavItem[];
  activeSection: SectionId;
  children: React.ReactNode;
}

// The persistent chrome around every top-level app screen: sidebar, topbar,
// mobile section chips, footer, and the account modal. Shared by /dashboard
// (the scroll-spy sections) and any standalone section page like /vault, so
// moving between them feels like one app, not a different shell per page.
//
// Every nav target is dispatched through one function: "vault" is a real
// route, so it always navigates there; everything else is a scroll-spy
// anchor that only exists on /dashboard, so it scrolls in-page when already
// there and otherwise navigates to /dashboard#id first.
export function DashboardShell({ nav, activeSection, children }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);

  // Warm the deposit network/token catalog into the store as soon as the user
  // is on the platform, on any page — so "Add funds" always opens with
  // networks already loaded rather than fetching (and often showing nothing)
  // on click.
  usePrefetchDepositCatalog();

  const navigate = useCallback(
    (id: string) => {
      if (id === "vault") {
        router.push("/vault");
        return;
      }
      if (pathname === "/dashboard") {
        scrollToSection(id);
      } else {
        router.push(`/dashboard#${id}`);
      }
    },
    [router, pathname]
  );

  return (
    <div className="min-h-screen bg-black">
      <Sidebar
        items={nav}
        activeSection={activeSection}
        onNavigate={(id) => navigate(id)}
        onOpenAccount={() => setAccountOpen(true)}
      />

      <main className="min-h-screen md:ml-[248px]">
        <div className="sticky top-0 z-[60]">
          <Topbar onOpenAccount={() => setAccountOpen(true)} onSelectSection={navigate} />
          <SectionChips sections={nav} activeId={activeSection} onSelect={navigate} />
        </div>

        {children}

        <DashboardFooter sections={nav} onSelect={navigate} />
      </main>

      <ModalShell open={accountOpen} onClose={() => setAccountOpen(false)}>
        <AccountModal onClose={() => setAccountOpen(false)} />
      </ModalShell>
    </div>
  );
}
