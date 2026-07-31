// Voice debug logging. One switch for the whole voice pipeline so we can trace a
// turn end-to-end in the browser console: capture → wake-word gate → send →
// frames → speak → relisten. Flip VOICE_DEBUG off to silence it.
//
// Enabled when NEXT_PUBLIC_VOICE_DEBUG is "1"/"true", OR always in development,
// so it's on by default while we're debugging the cut-off issue.
const FLAG = process.env.NEXT_PUBLIC_VOICE_DEBUG;
export const VOICE_DEBUG =
  FLAG === "1" || FLAG === "true" || (FLAG !== "0" && process.env.NODE_ENV !== "production");

// A high-contrast console tag so voice logs are easy to spot and filter on
// "[vivid]" in the console.
const STYLE = "background:#5320A8;color:#fff;padding:1px 5px;border-radius:3px;font-weight:600";

// Monotonic clock since page load, so we can read the timing between steps
// (e.g. how long between "listening" and "silence → stop").
function ts(): string {
  return `+${Math.round(performance.now())}ms`;
}

/** Log a voice-pipeline event. `scope` is the stage (capture/session/loop/tts). */
export function vlog(scope: string, event: string, data?: unknown): void {
  if (!VOICE_DEBUG) return;
  if (data === undefined) {
    console.log(`%c[vivid]`, STYLE, `${ts()} ${scope} › ${event}`);
  } else {
    console.log(`%c[vivid]`, STYLE, `${ts()} ${scope} › ${event}`, data);
  }
}

/** Log a voice-pipeline warning/error (always shown, even outside debug). */
export function vwarn(scope: string, event: string, data?: unknown): void {
  console.warn(`%c[vivid]`, STYLE, `${scope} › ${event}`, data ?? "");
}
