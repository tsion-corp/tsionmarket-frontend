// Central translation of any thrown error into a plain, actionable message for
// the user. Raw wallet, provider, and network text must never reach the UI.
// Written for non-crypto users: calm, specific, and it says what to do next.
// Pure and side-effect free, so it is exhaustively unit tested.

function text(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }
  return "";
}

// Map an error to a friendly message. Pass a `fallback` tailored to the action
// (e.g. "We couldn't complete your purchase.") — it is used only when the error
// isn't one of the known cases.
export function friendlyError(
  e: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  const m = text(e).toLowerCase();
  if (!m) return fallback;

  // The user dismissed the request in their wallet.
  if (
    /(user rejected|user denied|denied the request|rejected the request|user declined|request rejected|cancell?ed|user closed)/.test(
      m
    )
  ) {
    return "You cancelled the request, so nothing was sent.";
  }
  // Not enough of the specific asset being moved (e.g. an ERC-20 balance revert).
  if (/insufficient[- ]?balance|amount exceeds balance|exceeds allowance/.test(m)) {
    return "You don't have enough of this asset for that. Try a smaller amount.";
  }
  // Not enough of the chain's native coin to cover the network fee.
  if (/insufficient funds|out of gas|gas required|cannot estimate gas|intrinsic gas/.test(m)) {
    return "You need a little more of the network's coin to cover the fee.";
  }
  // Provider is busy or rate limiting us.
  if (/too many requests|rate.?limit|\b429\b/.test(m)) {
    return "We're a bit busy right now. Please try again in a moment.";
  }
  // Connectivity problems.
  if (
    /failed to fetch|fetch failed|network ?error|timed? ?out|timeout|econn|offline|load failed/.test(
      m
    )
  ) {
    return "Connection problem. Check your internet and try again.";
  }
  // No route, unsupported asset/chain, or the price moved.
  if (
    /not supported|unsupported|no route|no deposit quote|insufficient liquidity|no liquidity|slippage|price impact|expired/.test(
      m
    )
  ) {
    return "We couldn't complete this right now. Try again, or a different amount or asset.";
  }
  return fallback;
}
