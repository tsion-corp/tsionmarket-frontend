"use client";

import { useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/lib/query-client";
import { Toaster } from "@/components/ui/toaster";

// Well-formed placeholder lets the app build before env vars are set.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cl0123456789abcdefghijklm";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["google", "twitter", "email", "passkey"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        appearance: {
          walletChainType: "ethereum-and-solana",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </PrivyProvider>
  );
}
