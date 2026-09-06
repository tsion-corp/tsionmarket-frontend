"use client";

import { useState } from "react";
import { defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { createQueryClient } from "@/lib/query-client";
import {
  RQ_PERSIST_KEY,
  RQ_PERSIST_MAX_AGE,
  RQ_PERSIST_BUSTER,
  isPersistedKey,
} from "@/lib/query-persist";
import { Toaster } from "@/components/ui/toaster";
import { ClickRipple } from "@/components/ui/click-ripple";

// What every route needs: the query client with its persisted cache, the
// toaster, the click ripple. Small on purpose. Everything a signed-in session
// needs and a signed-out page does not, Privy above all, lives in
// app/(session)/providers.tsx, so the
// landing page and the privacy policy no longer download a wallet SDK.
export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  // Storage is undefined on the server, which makes the persister a no-op there,
  // so the same provider tree renders on both sides without a hydration mismatch.
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: RQ_PERSIST_KEY,
      throttleTime: 1000,
    })
  );
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: RQ_PERSIST_MAX_AGE,
        buster: RQ_PERSIST_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) && isPersistedKey(query.queryKey),
        },
      }}
    >
      <ClickRipple />
      {children}
      <Toaster />
    </PersistQueryClientProvider>
  );
}
