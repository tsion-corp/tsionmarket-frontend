import type { Metadata } from "next";
import { LegalDocument } from "@/components/ui/legal-document";
import { BRAND } from "@/lib/brand";
import { LAST_UPDATED, SECTIONS, SUPPORT_EMAIL } from "@/app/terms/content";

// A guest page, like the privacy policy: reachable at /terms and from the
// sign in page's "Terms" link, with no account needed to read it.
export const metadata: Metadata = {
  title: `Terms of Service · ${BRAND}`,
  description: `The terms on which you use ${BRAND}.`,
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      contactLead="Questions about these terms go to"
      supportEmail={SUPPORT_EMAIL}
    />
  );
}
