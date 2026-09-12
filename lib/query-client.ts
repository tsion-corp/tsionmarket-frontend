import { QueryClient } from "@tanstack/react-query";
import { retryDelay } from "@/lib/retry-delay";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        // A backgrounded tab is a tab nobody is looking at. Every poll that
        // fires there is a wasted request — and across 60+ polling hooks in
        // the app, forgotten tabs were the single largest source of provider
        // cost. The four game-board hooks that genuinely need background
        // updates (chess match, draughts match, chess chat/comments) override
        // this with `refetchIntervalInBackground: true` explicitly.
        refetchIntervalInBackground: false,
        // Never retry a rate-limited request — retrying an already-throttled
        // endpoint only deepens the 429. Retry other transient failures twice.
        retry: (failureCount, error) => {
          const message = (error as { message?: string })?.message?.toLowerCase() ?? "";
          const code = String((error as { code?: unknown })?.code ?? "").toUpperCase();
          if (
            message.includes("too many requests") ||
            message.includes("rate limit") ||
            code.includes("RATE") ||
            code === "429" ||
            code === "TOO_MANY_REQUESTS"
          ) {
            return false;
          }
          // The breaker has already established that the server is
          // unreachable. Retrying asks the same question two more times and
          // pays for both; the cooldown decides when to ask again.
          if (message.includes("can't reach the server")) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => retryDelay(attempt),
      },
    },
  });
}
