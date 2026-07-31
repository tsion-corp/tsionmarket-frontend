// How a listing's deadline reads on a card. Pure, so the wording is testable
// and the same everywhere a deadline appears.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface DeadlineLabel {
  text: string;
  // True once the deadline has passed, so a card can mute it rather than
  // showing a countdown that has gone backwards.
  closed: boolean;
}

// `now` is a parameter rather than read inside so the label can be tested
// without freezing the clock.
export function deadlineLabel(deadline: string | null, now: number = Date.now()): DeadlineLabel {
  if (!deadline) return { text: "No deadline", closed: false };

  const at = new Date(deadline).getTime();
  if (Number.isNaN(at)) return { text: "No deadline", closed: false };

  const remaining = at - now;
  if (remaining <= 0) return { text: "Closed", closed: true };

  if (remaining < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(remaining / MINUTE_MS));
    return { text: `${minutes}m left`, closed: false };
  }
  if (remaining < DAY_MS) {
    return { text: `${Math.floor(remaining / HOUR_MS)}h left`, closed: false };
  }
  const days = Math.floor(remaining / DAY_MS);
  return { text: `${days}d left`, closed: false };
}

// The full date, for a detail page where the exact cut-off matters.
export function formatDeadline(deadline: string | null): string {
  if (!deadline) return "No deadline";
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return "No deadline";
  return date.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
