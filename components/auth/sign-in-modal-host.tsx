"use client";

import dynamic from "next/dynamic";
import { useSignInOpen } from "@/hooks/use-sign-in";

// Loaded on first open so it stays out of every page's first load.
const SignInModal = dynamic(
  () => import("@/components/auth/sign-in-modal").then((m) => m.SignInModal),
  { ssr: false }
);

// The user stays on the page they were on, so they can retry what they tapped.
export function SignInModalHost() {
  const open = useSignInOpen();
  return open ? <SignInModal /> : null;
}
