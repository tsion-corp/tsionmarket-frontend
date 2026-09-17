"use client";

// The result of an attempt, told apart by what actually happened.
//
// "error" is a failure: nothing was sent, the user should try again.
// "notice" is an outcome we cannot confirm yet: the transfer IS on its way, so
// it must not be dressed as a failure. Both withdraw screens used to render
// the unconfirmed case in the same red as a genuine error, which is what made
// a working offramp look broken to the person using it.
export type Feedback = { kind: "error" | "notice"; message: string };

export const asError = (message: string): Feedback => ({ kind: "error", message });
export const asNotice = (message: string): Feedback => ({ kind: "notice", message });

export function FormFeedback({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;

  // A failure interrupts: assistive tech should hear it now. An unconfirmed
  // result is informational and waits its turn.
  return feedback.kind === "error" ? (
    <p role="alert" className="text-down mt-3 text-[13px] font-normal">
      {feedback.message}
    </p>
  ) : (
    <p role="status" aria-live="polite" className="mt-3 text-[13px] font-normal text-white/70">
      {feedback.message}
    </p>
  );
}
