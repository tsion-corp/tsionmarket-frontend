// Wake-word gate (Step 6). In a hands-free session the mic reopens after every
// turn, so ambient speech would otherwise fire actions. This gate requires each
// utterance to ADDRESS Vivid — the transcript must start with the wake word —
// before it is acted on, and strips the wake word so the backend sees only the
// actual request.
//
// This is the cheap, reliable first version: a transcript-prefix match, not an
// always-on acoustic wake-word model. It runs on the FINAL transcript the
// backend returns, so it needs no extra audio model in the browser.

// Spoken forms that count as addressing Vivid. Kept lowercase; matching is
// case-insensitive and tolerant of the comma/pause after the name.
const WAKE_FORMS = ["vivid", "hey vivid", "ok vivid", "okay vivid", "hi vivid"];

// Leading filler to ignore before the wake word ("um, vivid…", "so vivid…").
const LEADING_FILLER = /^(?:um+|uh+|so|hey|ok|okay|hi|hello|yo)[\s,]+/i;

export interface WakeMatch {
  // Whether the utterance addressed Vivid.
  matched: boolean;
  // The request with the wake word removed (empty if the user only said "Vivid").
  command: string;
}

// Normalize for matching: lowercased, punctuation-trimmed, collapsed spaces.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect whether a transcript addresses Vivid and, if so, return the remaining
 * command with the wake word stripped. Accepts an optional leading filler word.
 *
 * Examples:
 *   "Vivid, what's my balance?"  → { matched: true,  command: "what's my balance?" }
 *   "Hey Vivid open markets"     → { matched: true,  command: "open markets" }
 *   "Vivid"                      → { matched: true,  command: "" }
 *   "what's my balance?"         → { matched: false, command: "" }
 */
export function matchWakeWord(transcript: string): WakeMatch {
  const stripped = transcript.replace(LEADING_FILLER, "");
  const normalized = normalize(stripped);

  for (const form of WAKE_FORMS) {
    if (normalized === form) {
      return { matched: true, command: "" };
    }
    if (normalized.startsWith(`${form} `)) {
      // Return the ORIGINAL-cased remainder so the backend/STT casing is kept;
      // recompute the cut on the normalized length via the original words.
      const remainderWords = stripped.trim().split(/\s+/).slice(form.split(" ").length);
      return { matched: true, command: remainderWords.join(" ") };
    }
  }
  return { matched: false, command: "" };
}
