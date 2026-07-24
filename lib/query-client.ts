import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
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
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
    },
  });
}
