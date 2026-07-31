"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { TextAreaField, TextField } from "@/components/dashboard/earn/form-field";
import { useCreateSubmission } from "@/hooks/use-earn-submission";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { EligibilityQuestion } from "@/lib/earn/api/types";

interface SubmitSheetProps {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  eligibility: EligibilityQuestion[];
}

// Entering a listing. The service also requires the user's talent profile to be
// filled in, which nothing in this app can set yet, so a refusal on that ground
// is surfaced with the service's own wording rather than guessed at.
export function SubmitSheet({
  open,
  onClose,
  listingId,
  listingTitle,
  eligibility,
}: SubmitSheetProps) {
  const create = useCreateSubmission();
  const [link, setLink] = useState("");
  const [otherInfo, setOtherInfo] = useState("");
  const [telegram, setTelegram] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<{ link?: string }>({});

  function reset() {
    setLink("");
    setOtherInfo("");
    setTelegram("");
    setAnswers({});
    setErrors({});
  }

  const missingAnswer = eligibility.some((q) => !q.optional && !answers[q.id]?.trim());

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!link.trim()) {
      setErrors({ link: "Add a link to your work." });
      return;
    }
    setErrors({});

    const id = toast.loading("Sending your entry…");
    try {
      await create.mutateAsync({
        listingId,
        link: link.trim(),
        otherInfo: otherInfo.trim(),
        telegram: telegram.trim(),
        eligibilityAnswers: eligibility.map((question) => ({
          question: question.question,
          answer: answers[question.id]?.trim() ?? "",
        })),
      });
      toast.success("Your entry is in. Good luck.", { id });
      reset();
      onClose();
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't send that entry."), { id });
    }
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      {/* noValidate: the sheet reports its own errors inline, so the browser's
          native validation must not block submit before those checks run. */}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="ws-display text-[18px] text-white">Submit your work</h2>
          <p className="mt-1 font-sans text-[12.5px] font-normal text-white/50">{listingTitle}</p>
        </div>

        <TextField
          label="Link to your work"
          type="url"
          required
          value={link}
          onChange={setLink}
          error={errors.link}
          placeholder="https://github.com/you/the-thing"
          hint="A repo, a deployed URL, or wherever the sponsor can see it."
        />

        <TextField
          label="Telegram"
          value={telegram}
          onChange={setTelegram}
          placeholder="https://t.me/yourhandle"
          hint="How the sponsor reaches you if you win."
        />

        {eligibility.map((question) => (
          <TextAreaField
            key={question.id}
            label={question.question}
            required={!question.optional}
            rows={3}
            value={answers[question.id] ?? ""}
            onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
          />
        ))}

        <TextAreaField
          label="Anything else"
          value={otherInfo}
          onChange={setOtherInfo}
          rows={3}
          placeholder="Optional notes for the sponsor."
        />

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="ws-inset flex-1 cursor-pointer rounded-full px-4 py-2.5 font-sans text-[13px] font-semibold text-white/70 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending || missingAnswer}
            className="bg-accent text-ink flex-1 cursor-pointer rounded-full px-4 py-2.5 font-sans text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {create.isPending ? "Sending…" : "Submit"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
