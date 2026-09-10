// One line per read, frame and decision in the Last Man feature, so a person
// watching the console can see which source answered and what it cost.
//
// On by default outside production. In production it is off unless the
// browser opts in with `localStorage.setItem("wsws.vault.debug", "1")`, so a
// live incident can be traced without a deploy and nobody else pays for it.

const STORAGE_KEY = "wsws.vault.debug";

function enabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** `[vault] <event>` plus whatever detail helps, only when logging is on. */
export function vaultLog(event: string, detail?: Record<string, unknown>): void {
  if (!enabled()) return;
  if (detail === undefined) console.info(`[vault] ${event}`);
  else console.info(`[vault] ${event}`, detail);
}
