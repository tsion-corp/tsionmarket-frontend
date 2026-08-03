"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListingFormFields } from "@/components/dashboard/earn/sponsor/listing-form-fields";
import {
  usePublishListing,
  useSaveListingDraft,
  useUpdateListing,
} from "@/hooks/use-earn-sponsor-listings";
import {
  buildListingPayload,
  emptyListingForm,
  validateListingForm,
  type ListingFormErrors,
  type ListingFormState,
} from "@/lib/earn/listing-form";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { Listing } from "@/lib/earn/api/types";

const PAGE = "mx-auto w-full max-w-[720px] px-4 pt-6 pb-20 sm:px-6";

interface ListingEditorProps {
  // Set when editing an existing listing rather than starting a new one.
  existing?: Listing;
  initialState?: ListingFormState;
}

// One editor for both creating and updating. A new listing is saved as a draft
// first because publish takes the id the draft call returns, so the two steps
// cannot be collapsed into one.
export function ListingEditorSection({ existing, initialState }: ListingEditorProps) {
  const router = useRouter();
  const [state, setState] = useState<ListingFormState>(initialState ?? emptyListingForm());
  const [errors, setErrors] = useState<ListingFormErrors>({});
  // The id of the draft this editor has already saved, so a second save
  // updates it rather than creating another listing.
  const [draftId, setDraftId] = useState<string | null>(existing?.id ?? null);

  const saveDraft = useSaveListingDraft();
  const publish = usePublishListing();
  const update = useUpdateListing();

  const busy = saveDraft.isPending || publish.isPending || update.isPending;

  // An existing listing that was never published. It is edited like any other,
  // but it also still needs the publish step a new listing gets.
  const isDraft = !!existing && !existing.isPublished;

  async function onSaveDraft() {
    const found = validateListingForm(state, { forPublish: false });
    setErrors(found);
    if (Object.keys(found).length) return;

    const id = toast.loading("Saving your draft…");
    try {
      const listing = await saveDraft.mutateAsync(buildListingPayload(state, draftId ?? undefined));
      setDraftId(listing.id);
      toast.success("Draft saved.", { id });
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't save that draft."), { id });
    }
  }

  async function onPublish() {
    const found = validateListingForm(state, { forPublish: true });
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Fix the highlighted fields first.");
      return;
    }

    const id = toast.loading("Publishing…");
    try {
      // Save first so publish acts on what is on screen, not on whatever was
      // last written.
      const listing = await saveDraft.mutateAsync(buildListingPayload(state, draftId ?? undefined));
      setDraftId(listing.id);
      await publish.mutateAsync(listing.id);
      toast.success("Your listing is live.", { id });
      router.push(`/earn/sponsor/listing/${listing.slug}?type=${state.type}`);
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't publish that listing."), { id });
    }
  }

  async function onUpdate() {
    if (!existing) return;
    const found = validateListingForm(state, { forPublish: true });
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Fix the highlighted fields first.");
      return;
    }

    const id = toast.loading("Saving your changes…");
    try {
      await update.mutateAsync({ id: existing.id, payload: buildListingPayload(state) });
      toast.success("Listing updated.", { id });
      router.push(`/earn/sponsor/listing/${existing.slug}?type=${state.type}`);
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't save those changes."), { id });
    }
  }

  return (
    <div className={PAGE}>
      <h1 className="ws-display text-[clamp(22px,3vw,30px)] tracking-[-0.02em] text-white">
        {!existing ? "New listing" : isDraft ? "Edit draft" : "Edit listing"}
      </h1>
      <p className="mt-1.5 font-sans text-[13px] font-normal text-white/50">
        {existing && !isDraft
          ? "Changes go live as soon as you save them."
          : "Save a draft as you go. Nothing is public until you publish."}
      </p>

      <form onSubmit={(event) => event.preventDefault()} className="mt-7" aria-busy={busy}>
        <ListingFormFields
          state={state}
          errors={errors}
          onChange={setState}
          slugLocked={!!existing}
        />

        {/* A draft is a draft whether it was started a minute ago or a week
            ago: both save through the draft endpoint, which accepts a partial
            listing, and both still need publishing. Only a listing that is
            already live is edited in place. */}
        <div className="mt-7 flex flex-wrap gap-2.5">
          {existing && !isDraft ? (
            <button
              type="button"
              onClick={onUpdate}
              disabled={busy}
              className="bg-accent text-ink flex-1 cursor-pointer rounded-full px-5 py-3 font-sans text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={busy}
                className="ws-inset flex-1 cursor-pointer rounded-full px-5 py-3 font-sans text-[13px] font-semibold text-white/75 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saveDraft.isPending ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                onClick={onPublish}
                disabled={busy}
                className="bg-accent text-ink flex-1 cursor-pointer rounded-full px-5 py-3 font-sans text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                {publish.isPending ? "Publishing…" : "Publish"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
