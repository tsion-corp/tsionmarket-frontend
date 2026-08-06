// The soft-takedown switch. With NEXT_PUBLIC_APP_ACTIVE=false the site stays
// up but every entry CTA opens a coming-soon notice instead of the app; unset
// or any other value means fully live, so nothing changes until it is set
// deliberately. Inlined at build time like every NEXT_PUBLIC_ value — flipping
// it means redeploying, which is also what makes it tamper-proof at runtime.
//
// Its server-side sibling, ALLOW_ACCESS=false, is read in proxy.ts and rejects
// direct navigation to any route but the landing page.
export const APP_ACTIVE = process.env.NEXT_PUBLIC_APP_ACTIVE !== "false";
