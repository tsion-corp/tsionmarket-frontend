"use client";

import { useEffect } from "react";
import { useIdentityToken } from "@privy-io/react-auth";
import { setHeldIdentityToken } from "@/lib/privy-identity-store";

// Mirrors the identity token the Privy SDK holds into a module store, so the
// fetch wrapper can attach it without asking Privy for it. Renders nothing.
// Sits inside PrivyProvider; see lib/privy-identity-store for why it exists.
export function IdentityTokenBridge() {
  const { identityToken } = useIdentityToken();
  useEffect(() => {
    setHeldIdentityToken(identityToken);
    return () => setHeldIdentityToken(null);
  }, [identityToken]);
  return null;
}
