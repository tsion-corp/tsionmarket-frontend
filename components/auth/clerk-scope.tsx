import { ClerkProvider } from "@clerk/nextjs";

/**
 * Clerk, mounted only on the routes that use it (sign-in, sign-up and the
 * wallet upgrade). It used to wrap the whole app from the root layout, which
 * shipped Clerk's client code to every page, the landing page and the privacy
 * policy included. The app keeps heavy providers out of the routes that don't
 * need them (see app/(session)/layout.tsx); this does the same.
 *
 * Without keys it renders nothing extra, so a deployment that has no Clerk
 * behaves exactly as before.
 */
export function ClerkScope({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}
