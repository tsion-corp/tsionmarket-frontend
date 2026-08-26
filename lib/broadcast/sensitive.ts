// The financial-data guard. Ark is a trading app, so a screen share can put a
// balance, a position, a wallet address or, worst of all, a recovery phrase in
// front of an audience. Three mechanisms, in increasing severity:
//
//  1. `data-sensitive` elements blur while a broadcast is running. Opt out per
//     element; never dependent on the user remembering to hide anything.
//  2. A route the app classes as sensitive suspends the outgoing video track
//     entirely: the viewer sees a black frame and a reason, not the screen.
//  3. Any flow can force the same suspend without being a route, by rendering
//     an element carrying `data-broadcast-suspend`. Transaction signing and
//     order confirmation are modals, not routes, which is why the route list
//     alone is not enough.
//
// None of this can see a seed phrase the user opens in another app or another
// tab. That is why the picker is constrained to a single tab and why the
// interstitial says so in words.

/** Set on the document root while a broadcast is running. */
export const BROADCASTING_CLASS = "broadcasting";
/** Set alongside it while the "blur balances" choice is on. */
export const BLUR_CLASS = "broadcasting-blur";
/** Marks an element whose content should blur while blurring is on. */
export const SENSITIVE_ATTRIBUTE = "data-sensitive";
/** Marks an element whose mere presence suspends the outgoing video. */
export const SUSPEND_ATTRIBUTE = "data-broadcast-suspend";

// Privy renders its dialog through a portal into document.body, so there is no
// component of ours to wrap: it is reached by id instead. That dialog is where
// wallet export, recovery phrases and MFA setup live, which is precisely the
// case this guard exists for, and it is also where login shows an email
// address. Every one of those is worth pausing for, so its mere presence
// suspends rather than trying to tell the screens apart from outside.
export const PRIVY_DIALOG_SELECTOR = "#privy-dialog";

/** Everything whose presence in the DOM suspends the outgoing video. */
export const SUSPEND_SELECTOR = `[${SUSPEND_ATTRIBUTE}], ${PRIVY_DIALOG_SELECTOR}`;

/**
 * Why the video must be held right now based on what is on screen, or null.
 *
 * Privy's dialog counts as "keys": it is the one surface that can show a
 * recovery phrase, and a wrong guess here is the difference between pausing a
 * stream and broadcasting a seed phrase.
 */
export function suspendReasonInDom(root: ParentNode): SuspendReason | null {
  if (root.querySelector(PRIVY_DIALOG_SELECTOR)) return "keys";
  if (root.querySelector(`[${SUSPEND_ATTRIBUTE}]`)) return "signing";
  return null;
}

// Path segments that mean "keys or recovery material is on this screen".
// Matched on whole segments so `/portfolio/backup-history` does not trip
// `backup`, and a future route gets caught by naming rather than by listing.
export type SuspendReason = "keys" | "security" | "signing";

const KEY_SEGMENTS = [
  "seed",
  "seed-phrase",
  "recovery",
  "recovery-phrase",
  "private-key",
  "export-key",
  "export-wallet",
  "backup",
  "mnemonic",
];

const AUTH_SEGMENTS = ["2fa", "two-factor", "mfa", "authenticator"];

/** Wording the live bar and the viewer's black frame both use. */
export const SUSPEND_LABEL: Record<SuspendReason, string> = {
  keys: "Paused — sensitive screen",
  security: "Paused — security settings",
  signing: "Paused — confirming a transaction",
};

function segmentsOf(path: string): string[] {
  return path
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
}

/**
 * Why this route must not be broadcast, or null when it is safe.
 *
 * Deliberately generous: a false positive pauses a stream for a moment, a
 * false negative broadcasts somebody's recovery phrase.
 */
export function sensitivePathReason(path: string): SuspendReason | null {
  const segments = segmentsOf(path);
  if (segments.some((segment) => KEY_SEGMENTS.includes(segment))) return "keys";
  if (segments.some((segment) => AUTH_SEGMENTS.includes(segment))) return "security";
  // A query flag, because key export is often a mode of an existing screen
  // rather than a route of its own.
  const query = path.split("?")[1] ?? "";
  if (/(^|&)(export|reveal)=(key|seed|phrase|wallet)/u.test(query)) return "keys";
  return null;
}

/** The kinds of data the interstitial lists as visible right now. */
export interface SensitiveInventory {
  balances: number;
  positions: number;
  addresses: number;
  other: number;
}

export function emptyInventory(): SensitiveInventory {
  return { balances: 0, positions: 0, addresses: 0, other: 0 };
}

/**
 * What Ark can see on screen that it classes as sensitive, counted from the
 * `data-sensitive` elements currently rendered. The interstitial shows this
 * rather than a generic warning, because a list of what is actually on screen
 * is what makes someone stop and look.
 */
export function inventorySensitive(root: ParentNode): SensitiveInventory {
  const found = emptyInventory();
  for (const element of root.querySelectorAll(`[${SENSITIVE_ATTRIBUTE}]`)) {
    const kind = element.getAttribute(SENSITIVE_ATTRIBUTE);
    if (kind === "balance") found.balances += 1;
    else if (kind === "position") found.positions += 1;
    else if (kind === "address") found.addresses += 1;
    else found.other += 1;
  }
  return found;
}

/** The interstitial's list, in the order it reads best. */
export function inventoryLines(found: SensitiveInventory): string[] {
  const lines: string[] = [];
  if (found.balances) lines.push(`${found.balances} balance${found.balances === 1 ? "" : "s"}`);
  if (found.positions)
    lines.push(`${found.positions} position${found.positions === 1 ? "" : "s"} and PnL`);
  if (found.addresses)
    lines.push(`${found.addresses} wallet address${found.addresses === 1 ? "" : "es"}`);
  if (found.other)
    lines.push(`${found.other} other sensitive field${found.other === 1 ? "" : "s"}`);
  return lines;
}
