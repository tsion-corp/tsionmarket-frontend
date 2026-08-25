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

function gatewayMeta(e: unknown): { code: string | null; status: number | null } {
  if (!e || typeof e !== "object") return { code: null, status: null };
  const maybe = e as { code?: unknown; status?: unknown };
  return {
    code: typeof maybe.code === "string" ? maybe.code : null,
    status: typeof maybe.status === "number" ? maybe.status : null,
  };
}

export function isConflictError(e: unknown): boolean {
  const gateway = gatewayMeta(e);
  return gateway.status === 409 || gateway.code === "CONFLICT";
}

function looksSafeServerMessage(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 160) return false;
  return !/(\bwallet_[a-z]+|alchemy|json-rpc|rpc\b|stack trace|traceback|panic\b|sqlstate|select\s|insert\s|update\s|delete\s|<!doctype|<html)/i.test(
    trimmed
  );
}

/**
 * Solidity custom errors arrive as a 4-byte selector, so a revert reaches the
 * UI as raw hex — "execution reverted … data: 0xe450d38c0000…" — which is the
 * worst thing a non-crypto user can be shown. These are the OpenZeppelin v5
 * ERC-20/ERC-2612 errors reachable from a token transfer, a permit, or a burn.
 *
 * Selectors are `keccak256(signature)[0:4]`; the signature is kept beside each
 * one so it can be re-derived rather than trusted.
 */
const CUSTOM_ERROR_MESSAGES: Record<string, string> = {
  // ERC20InsufficientBalance(address,uint256,uint256)
  "0xe450d38c": "You don't have enough of this asset for that. Try a smaller amount.",
  // ERC20InsufficientAllowance(address,uint256,uint256)
  "0xfb8f41b2": "This transfer hasn't been approved yet. Approve it and try again.",
  // ERC20InvalidSender(address)
  "0x96c6fd1e": "That transfer came from an unexpected account. Reconnect your wallet and retry.",
  // ERC20InvalidReceiver(address)
  "0xec442f05": "That destination address can't receive this asset.",
  // ERC2612ExpiredSignature(uint256)
  "0x62791302": "The approval you signed has expired. Please try again.",
  // ERC2612InvalidSigner(address,address)
  "0x4b800e46": "That approval was signed by a different wallet. Reconnect and try again.",
  // The Last Man Standing vault (King of Night v4 on Base). Selectors from the
  // compiled ABI in features/casino/lib/last-standing/king-of-night-abi.ts.
  // StakeBelowMinimum(uint256,uint256)
  "0x78e030db": "That stake is under the minimum to open a game. Raise it and try again.",
  // WagerBelowGameMinimum(uint256,uint256)
  "0x10169bd5": "That wager is under this game's minimum. Raise it and try again.",
  // GameNotFound(uint256)
  "0xd13b2677": "That game doesn't exist. Head back to the lobby.",
  // GameOver(uint256)
  "0x3496ed15":
    "This round is over, so it can't take another wager. Start a new game or join another.",
  // AlreadySettled(uint256)
  "0x8fec535e": "This round has already been settled and paid.",
  // TimerNotExpired(uint256,uint256)
  "0xb52cb3ad": "The clock hasn't run out yet. The round can be settled once it does.",
  // GamePaused()
  "0x379a7ed9": "The game is paused right now. Please try again later.",
  // NothingToClaim(address)
  "0x64ab3466": "There's nothing left to claim for this wallet.",
};

/** True when a revert is the vault's AlreadySettled: someone else paid it first. */
export function isAlreadySettledError(e: unknown): boolean {
  return /0x8fec535e/i.test(text(e));
}

/** The custom-error message for a revert, if its selector is one we know. */
function customErrorMessage(raw: string): string | null {
  // Any 0x-prefixed 4-byte word in the text: providers wrap the payload
  // differently (`data:`, `reason:`, nested `cause`), so matching the selector
  // itself is more robust than matching any one provider's phrasing.
  for (const match of raw.matchAll(/0x[0-9a-fA-F]{8}/g)) {
    const known = CUSTOM_ERROR_MESSAGES[match[0].toLowerCase()];
    if (known) return known;
  }
  return null;
}

// Map an error to a friendly message. Pass a `fallback` tailored to the action
// (e.g. "We couldn't complete your purchase.") — it is used only when the error
// isn't one of the known cases.
export function friendlyError(
  e: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  const raw = text(e).trim();
  const m = raw.toLowerCase();
  if (!m) return fallback;
  const gateway = gatewayMeta(e);

  // The Solana sell executor already replaced the stale amount with confirmed
  // chain state. Tell the user why another confirmation is required instead
  // of masking it behind the generic order failure.
  if (/^your solana balance changed\./i.test(raw)) return raw;

  if (gateway.code === "PLAYER_BALANCE_INSUFFICIENT") {
    return "You don't have enough in your chess balance for that. Deposit more USDC or choose a smaller stake.";
  }
  if (gateway.code === "HOUSE_RESERVE_INSUFFICIENT") {
    return "Stockfish staking is temporarily unavailable because the reward reserve is low. You can still play a free game.";
  }

  // Before the text patterns: a custom-error revert often ALSO contains the
  // word "reverted", which no pattern below would translate, so the hex would
  // survive all the way to the toast.
  const custom = customErrorMessage(raw);
  if (custom) return custom;

  // The user dismissed the request in their wallet.
  if (
    /(user rejected|user denied|denied the request|rejected the request|user declined|request rejected|cancell?ed|user closed)/.test(
      m
    )
  ) {
    return "You cancelled the request, so nothing was sent.";
  }
  // The chess cashier has its own internal balance. Preserve that distinction
  // so a withdrawal failure doesn't read like a wallet/allowance problem.
  if (/insufficient available balance|player balance insufficient/.test(m)) {
    return "You don't have enough in your chess balance for that. Deposit more USDC or choose a smaller amount.";
  }
  if (/house reserve insufficient/.test(m)) {
    return "Stockfish staking is temporarily unavailable because the reward reserve is low. You can still play a free game.";
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
  // Solana failures arrive as RPC simulation dumps ("Transaction simulation
  // failed: ... custom program error: 0x1" plus pages of program logs), which
  // no user should ever face. 0x1 from the token program is an insufficient
  // balance; 0x1771 is Jupiter's slippage guard.
  if (/custom program error: 0x1771\b/.test(m)) {
    return "We couldn't complete this right now. Try again, or a different amount or asset.";
  }
  if (/custom program error: 0x1\b/.test(m)) {
    return "You don't have enough of this asset for that. Try a smaller amount.";
  }
  if (/insufficient lamports|found no record of a prior credit/.test(m)) {
    return "You need a little more of the network's coin to cover the fee.";
  }
  if (/blockhash not found|block height exceeded/.test(m)) {
    return "That took too long and expired on the network. Please try again.";
  }
  if (/transaction simulation failed|error processing instruction/.test(m)) {
    return "The network rejected this transaction. Nothing was charged, so please try again.";
  }

  // An unrecognised revert. The selector is not in the table above, so there is
  // nothing meaningful to say about it — but the raw text carries calldata, and
  // showing a user "0x4e487b710000000000000000000000000000000000000000000000000000000000000011"
  // is worse than saying nothing. Must precede the server-message passthrough,
  // which would otherwise judge a short revert string "safe" and print it.
  if (/execution reverted|call revert|\breverted\b|0x[0-9a-fA-F]{8,}/.test(raw)) {
    return "The network rejected this transaction. Nothing was charged, so please try again.";
  }
  // For typed server responses (like chess cashier failures), keep the message
  // when it is already plain English and not obviously an infrastructure dump.
  if (gateway.status !== null && gateway.status >= 400 && looksSafeServerMessage(raw)) {
    return raw;
  }
  return fallback;
}

/**
 * The raw reason, sized for fine print: whitespace collapsed and capped, so
 * support can act on a screenshot without the user facing a wall of RPC logs.
 * Never a substitute for friendlyError; always rendered beside it.
 */
export function supportDetail(e: unknown, max = 160): string {
  const raw = text(e).replace(/\s+/g, " ").trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1).trimEnd()}\u2026`;
}
