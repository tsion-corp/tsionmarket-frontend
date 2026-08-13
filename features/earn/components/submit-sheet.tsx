"use client";

import { useEffect, useRef, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { TextAreaField, TextField } from "@/features/earn/components/form-field";
import { TalentProfileForm } from "@/features/earn/components/talent-profile-form";
import { AsyncLoading } from "@/components/ui/async-state";
import { ImageUploadField } from "@/features/earn/components/image-upload-field";
import { useCreateSubmission } from "@/features/earn/hooks/use-earn-submission";
import { useTalentProfile } from "@/features/earn/hooks/use-earn-talent";
import { useScrollToFirstError } from "@/hooks/use-scroll-to-first-error";
import { useWallets } from "@privy-io/react-auth";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { track } from "@/lib/analytics/mixpanel";
import type {
  Attachment,
  CompensationType,
  Deliverable,
  EligibilityQuestion,
} from "@/features/earn/lib/api/types";

interface SubmitSheetProps {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  eligibility: EligibilityQuestion[];
  // A listing priced as a range asks the applicant what they want for the work.
  // The service requires it for those and rejects it on the rest.
  compensationType?: CompensationType;
  rewardToken?: string;
}

const MAX_DELIVERABLES = 10;

// Entering a listing. The service refuses a submission from an account whose
// talent profile is not filled in, so the sheet asks for that first rather than
// letting someone write out an entry and lose it to a rejection they were given
// no warning about.
export function SubmitSheet({
  open,
  onClose,
  listingId,
  listingTitle,
  eligibility,
  compensationType = "fixed",
  rewardToken = "USDC",
}: SubmitSheetProps) {
  const create = useCreateSubmission();

  // Opening the entry form is the start of an application; the pair with
  // earn_application_submitted is what makes the drop-off measurable.
  useEffect(() => {
    if (open) track("earn_application_started", { listing_id: listingId });
  }, [open, listingId]);
  const { profile, needsProfile, isLoading: profileLoading } = useTalentProfile();
  const { wallets } = useWallets();
  // Recorded with the entry so a winner can be paid without having opened the
  // profile form. Waiting for that left winners unpayable.
  const walletAddress = wallets.find((w) => w.walletClientType === "privy")?.address;
  const [link, setLink] = useState("");
  const [otherInfo, setOtherInfo] = useState("");
  const [telegram, setTelegram] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [ask, setAsk] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  useScrollToFirstError(formRef, errors);

  // Only a range asks what you want for the work. A fixed reward is already
  // decided, and the service rejects an ask on one.
  const wantsAsk = compensationType === "range" || compensationType === "variable";

  function reset() {
    setLink("");
    setOtherInfo("");
    setTelegram("");
    setAnswers({});
    setDeliverables([]);
    setAttachments([]);
    setAsk("");
    setErrors({});
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!link.trim()) found.link = "Add a link to your work.";
    if (wantsAsk) {
      const amount = Number(ask);
      if (!ask.trim() || !Number.isFinite(amount) || amount <= 0) {
        found.ask = "Say what you're asking for.";
      }
    }
    for (const question of eligibility) {
      if (!question.optional && !answers[question.id]?.trim()) {
        found[question.id] = "This one's required.";
      }
    }
    setErrors(found);
    if (Object.keys(found).length) return;

    const id = toast.loading("Sending your entry…");
    try {
      await create.mutateAsync({
        listingId,
        ...(walletAddress ? { walletAddress } : {}),
        link: link.trim(),
        otherInfo: otherInfo.trim(),
        telegram: (telegram || (profile?.telegram ?? "")).trim(),
        eligibilityAnswers: eligibility.map((question) => ({
          question: question.question,
          answer: answers[question.id]?.trim() ?? "",
        })),
        // Only sent when there is something to send: the service validates
        // these and an empty array is noise on an entry that is just a link.
        ...(deliverables.length ? { deliverables } : {}),
        ...(attachments.length ? { attachments } : {}),
        ...(wantsAsk ? { ask: Number(ask) } : {}),
      });
      track("earn_application_submitted", { listing_id: listingId });
      toast.success("Your entry is in. Good luck.", { id });
      reset();
      onClose();
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't send that entry."), { id });
    }
  }

  // The profile is a prerequisite, not a step of the entry, so it takes over
  // the sheet entirely. Filling it in drops straight through to the entry form
  // with the listing still in hand.
  if (profileLoading || needsProfile === undefined) {
    return (
      <ModalShell open={open} onClose={onClose}>
        <div className="p-5">
          <AsyncLoading label="Loading your profile" rows={3} />
        </div>
      </ModalShell>
    );
  }

  if (needsProfile) {
    return (
      <ModalShell open={open} onClose={onClose}>
        <div className="flex flex-col gap-4 p-5">
          <div>
            <h2 className="ws-display text-[18px] text-white">First, your profile</h2>
            <p className="mt-1 font-sans text-[12.5px] font-normal text-white/50">
              Sponsors see this when they review your work. You only fill it in once.
            </p>
          </div>
          {/* Nothing to do on completion: saving invalidates the profile
              query, `needsProfile` turns false, and this sheet re-renders as
              the entry form with the listing still in hand. */}
          <TalentProfileForm
            existing={profile}
            onDone={() => undefined}
            submitLabel="Save and continue"
          />
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell open={open} onClose={onClose}>
      {/* noValidate: the sheet reports its own errors inline, so the browser's
          native validation must not block submit before those checks run. */}
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex max-h-[80vh] flex-col">
        <div className="flex flex-col gap-5 overflow-y-auto p-5">
          <div>
            <h2 className="ws-display text-[18px] text-white">Submit your work</h2>
            <p className="mt-1 truncate font-sans text-[12.5px] font-normal text-white/50">
              {listingTitle}
            </p>
          </div>

          <SheetSection title="Your work">
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

            <DeliverablesField value={deliverables} onChange={setDeliverables} />

            <AttachmentsField value={attachments} onChange={setAttachments} />
          </SheetSection>

          <SheetSection title="About your entry">
            {/* Defaults to the handle already on the profile, which is where a
            sponsor would look anyway, while staying editable per entry. */}
            <TextField
              label="Telegram"
              value={telegram || (profile?.telegram ?? "")}
              onChange={setTelegram}
              placeholder="https://t.me/yourhandle"
              hint="How the sponsor reaches you if you win."
            />

            {wantsAsk ? (
              <TextField
                label={`Your ask (${rewardToken})`}
                required
                value={ask}
                error={errors.ask}
                placeholder="1000"
                hint="What you want for this work. The sponsor set a range, not a fixed price."
                onChange={(value) => {
                  // Digits and a single decimal point, rejected as typed rather
                  // than accepted and failed on submit.
                  if (value === "" || /^\d*\.?\d*$/.test(value)) setAsk(value);
                }}
              />
            ) : null}

            {eligibility.map((question) => (
              <TextAreaField
                key={question.id}
                label={question.question}
                required={!question.optional}
                rows={3}
                value={answers[question.id] ?? ""}
                error={errors[question.id]}
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
          </SheetSection>
        </div>

        {/* Pinned, so a long entry never pushes the actions out of reach. */}
        <div className="flex gap-2 border-t border-white/8 p-5">
          <button
            type="button"
            onClick={onClose}
            className="ws-inset flex-1 cursor-pointer rounded-full px-4 py-2.5 font-sans text-[13px] font-semibold text-white/70 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className="bg-accent text-ink flex-1 cursor-pointer rounded-full px-4 py-2.5 font-sans text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {create.isPending ? "Sending…" : "Submit"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// A titled group of fields, so the sheet reads as a few short sections rather
// than one long stack of inputs.
function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <span className="text-[10.5px] font-normal tracking-[0.08em] text-white/40 uppercase">
        {title}
      </span>
      {children}
    </section>
  );
}

// Extra named links beyond the main one. Empty by default: most entries are a
// single URL, and a row of blank fields would imply otherwise.
function DeliverablesField({
  value,
  onChange,
}: {
  value: Deliverable[];
  onChange: (next: Deliverable[]) => void;
}) {
  function set(index: number, patch: Partial<Deliverable>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-sans text-[12.5px] font-medium text-white/70">
        Other deliverables
        <span className="ml-1.5 font-normal text-white/35">optional</span>
      </span>

      {value.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={item.label}
            aria-label={`Deliverable ${index + 1} name`}
            placeholder="Demo"
            onChange={(event) => set(index, { label: event.target.value })}
            className="ws-inset focus:border-accent/50 w-[34%] rounded-[12px] px-3 py-2.5 font-sans text-[13px] text-white outline-none placeholder:text-white/25"
          />
          <input
            value={item.url}
            aria-label={`Deliverable ${index + 1} link`}
            placeholder="https://…"
            onChange={(event) => set(index, { url: event.target.value })}
            className="ws-inset focus:border-accent/50 w-full rounded-[12px] px-3 py-2.5 font-sans text-[13px] text-white outline-none placeholder:text-white/25"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            aria-label={`Remove deliverable ${index + 1}`}
            className="shrink-0 cursor-pointer rounded-lg border border-white/12 px-2.5 py-2 font-sans text-[12px] text-white/50 hover:text-white"
          >
            Remove
          </button>
        </div>
      ))}

      {value.length < MAX_DELIVERABLES ? (
        <button
          type="button"
          onClick={() => onChange([...value, { label: "", url: "" }])}
          className="cursor-pointer self-start rounded-full border border-white/12 px-3.5 py-1.5 font-sans text-[12px] font-medium text-white/60 transition-colors hover:text-white"
        >
          Add a link
        </button>
      ) : null}
    </div>
  );
}

// Screenshots and documents, for work a reviewer cannot open as a link. Uses
// the same upload as every other image on the platform.
function AttachmentsField({
  value,
  onChange,
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {value.map((item, index) => (
        <div key={item.url} className="flex items-center gap-3">
          {/* An arbitrary remote URL, so a plain img rather than the Next loader. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt=""
            className="size-12 shrink-0 rounded-[10px] border border-white/10 object-cover"
          />
          <input
            value={item.caption ?? ""}
            aria-label={`Attachment ${index + 1} caption`}
            placeholder="What this shows"
            onChange={(event) =>
              onChange(
                value.map((a, i) => (i === index ? { ...a, caption: event.target.value } : a))
              )
            }
            className="ws-inset focus:border-accent/50 w-full rounded-[12px] px-3 py-2.5 font-sans text-[13px] text-white outline-none placeholder:text-white/25"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            aria-label={`Remove attachment ${index + 1}`}
            className="shrink-0 cursor-pointer rounded-lg border border-white/12 px-2.5 py-2 font-sans text-[12px] text-white/50 hover:text-white"
          >
            Remove
          </button>
        </div>
      ))}

      {value.length < MAX_DELIVERABLES ? (
        <ImageUploadField
          label="Screenshots"
          source="description"
          value=""
          hint="Optional. PNG, JPEG or WebP, up to 5MB."
          onChange={(url) => onChange([...value, { url }])}
        />
      ) : null}
    </div>
  );
}
