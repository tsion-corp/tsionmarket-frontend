/**
 * Retry delay with JITTER.
 *
 * The delays used to be exactly 1s, 2s, 4s. Every client that failed at the
 * same moment — which, in an outage, is all of them — therefore retried at the
 * same moment, three times, in lockstep. That is a retry storm: the backend
 * gets a synchronised wave the instant it tries to come back up, and falls
 * over again.
 *
 * Randomising each delay across a window spreads the same number of requests
 * over time. It costs nothing and it is the difference between a service that
 * recovers and one that is held down by its own clients.
 */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(1000 * 2 ** attempt, 8000);
  // Full jitter across [base/2, base]: still backs off, never synchronised.
  return Math.round(base / 2 + random() * (base / 2));
}
