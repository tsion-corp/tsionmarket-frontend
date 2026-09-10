import type { Metadata } from "next";
import { LegalDocument } from "@/components/ui/legal-document";
import { BRAND } from "@/lib/brand";
import { LAST_UPDATED, SECTIONS, SUPPORT_EMAIL } from "@/app/privacy/content";

// A guest page: no auth, no app shell, no sidebar. Someone reading a privacy
// policy is often deciding whether to sign up at all, and a page that demands
// an account first answers the question badly.
//
// Reachable at /privacy, from the sign in page's "Privacy Policy" link, and
// by the links that have to point at it: app store listings, OAuth consent
// screens, a payment provider's onboarding form.
export const metadata: Metadata = {
  title: `Privacy Policy · ${BRAND}`,
  description: `How ${BRAND} collects, uses, shares and protects personal information.`,
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      contactLead="Questions about this policy, or about the information we hold on you, go to"
      supportEmail={SUPPORT_EMAIL}
    />
  );
}
