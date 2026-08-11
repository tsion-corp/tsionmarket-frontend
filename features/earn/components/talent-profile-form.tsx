"use client";

import { useRef, useState } from "react";
import { SelectField, TextAreaField, TextField } from "@/features/earn/components/form-field";
import { ImageUploadField } from "@/features/earn/components/image-upload-field";
import { useWallets } from "@privy-io/react-auth";
import { useCompleteTalentProfile } from "@/features/earn/hooks/use-earn-talent";
import { useScrollToFirstError } from "@/hooks/use-scroll-to-first-error";
import {
  SKILL_CATEGORIES,
  type SkillCategory,
  type TalentProfile,
} from "@/features/earn/lib/api/types";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

// Lowercase letters, numbers, underscores and hyphens. The same rule the
// service applies, checked here so a bad handle is caught under the field
// rather than after a round trip.
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

interface TalentProfileFormProps {
  // Prefills the form when the profile exists but is incomplete, so nothing
  // already entered has to be typed twice.
  existing?: TalentProfile | null;
  onDone: () => void;
  // Named for what finishing the form unblocks, since it is nearly always
  // reached on the way to entering a listing.
  submitLabel?: string;
}

interface FormState {
  firstName: string;
  lastName: string;
  username: string;
  photo: string;
  bio: string;
  location: string;
  skill: SkillCategory | "";
  telegram: string;
  github: string;
  twitter: string;
  website: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

function initialState(existing?: TalentProfile | null): FormState {
  return {
    firstName: existing?.firstName ?? "",
    lastName: existing?.lastName ?? "",
    username: existing?.username ?? "",
    photo: existing?.photo ?? "",
    bio: existing?.bio ?? "",
    location: existing?.location ?? "",
    skill: (existing?.skills[0]?.skill ?? "") as SkillCategory | "",
    telegram: existing?.telegram ?? "",
    github: existing?.github ?? "",
    twitter: existing?.twitter ?? "",
    website: existing?.website ?? "",
  };
}

function validate(state: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!state.firstName.trim()) errors.firstName = "Add your first name.";
  if (!state.lastName.trim()) errors.lastName = "Add your last name.";
  if (!state.username.trim()) errors.username = "Pick a username.";
  else if (!USERNAME_PATTERN.test(state.username.trim())) {
    errors.username = "Letters, numbers, underscores and hyphens only.";
  }
  return errors;
}

// The profile a sponsor sees when judging an entry, and the one thing standing
// between a signed-in user and being able to enter a listing at all: the
// service refuses a submission until this is filled in.
export function TalentProfileForm({ existing, onDone, submitLabel }: TalentProfileFormProps) {
  const [state, setState] = useState<FormState>(() => initialState(existing));
  const [errors, setErrors] = useState<FormErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  useScrollToFirstError(formRef, errors);
  const complete = useCompleteTalentProfile();
  const { wallets } = useWallets();
  // Captured rather than typed. This is where a reward is paid, so a hand-typed
  // address is a way to lose money to a typo; the connected wallet is already
  // the right answer.
  const walletAddress = wallets.find((w) => w.walletClientType === "privy")?.address;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate(state);
    setErrors(found);
    if (Object.keys(found).length) return;

    const id = toast.loading("Saving your profile…");
    try {
      await complete.mutateAsync({
        firstName: state.firstName.trim(),
        lastName: state.lastName.trim(),
        username: state.username.trim(),
        photo: state.photo,
        bio: state.bio.trim(),
        location: state.location.trim(),
        skills: state.skill ? [{ skills: state.skill, subskills: [] }] : [],
        telegram: state.telegram.trim(),
        github: state.github.trim(),
        twitter: state.twitter.trim(),
        website: state.website.trim(),
        ...(walletAddress ? { walletAddress } : {}),
      });
      toast.success("Profile saved.", { id });
      onDone();
    } catch (error) {
      const message = friendlyError(error, "Couldn't save that profile.");
      toast.error(message, { id });
      // A taken username can only be caught server-side. Route it back to the
      // field it's about rather than leaving it as a passing toast.
      if (/username/i.test(message)) setErrors((prev) => ({ ...prev, username: message }));
    }
  }

  return (
    // noValidate: the form reports its own errors inline, so the browser's
    // native validation must not block submit before those checks run.
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First name"
          required
          value={state.firstName}
          error={errors.firstName}
          onChange={(value) => set("firstName", value)}
        />
        <TextField
          label="Last name"
          required
          value={state.lastName}
          error={errors.lastName}
          onChange={(value) => set("lastName", value)}
        />
      </div>

      <TextField
        label="Username"
        required
        value={state.username}
        error={errors.username}
        hint="How you appear to sponsors."
        onChange={(value) => set("username", value)}
      />

      <ImageUploadField
        label="Photo"
        source="user"
        value={state.photo}
        onChange={(url) => set("photo", url)}
        hint="Optional. PNG, JPEG or WebP, up to 5MB."
      />

      <TextAreaField
        label="Short bio"
        rows={3}
        maxLength={180}
        value={state.bio}
        onChange={(value) => set("bio", value)}
        placeholder="What you build, in a sentence or two."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Main skill"
          value={state.skill}
          options={[
            { value: "" as SkillCategory | "", label: "Pick a skill" },
            ...SKILL_CATEGORIES.map((skill) => ({
              value: skill as SkillCategory | "",
              label: skill,
            })),
          ]}
          onChange={(value) => set("skill", value)}
        />
        {/* Decides which region-restricted listings are open to you. Listings
            open to everyone ignore it, which is why it is not required. */}
        <TextField
          label="Location"
          value={state.location}
          hint="Only matters for region-restricted listings."
          onChange={(value) => set("location", value)}
        />
      </div>

      <TextField
        label="Telegram"
        value={state.telegram}
        placeholder="https://t.me/yourhandle"
        hint="How a sponsor reaches you if you win."
        onChange={(value) => set("telegram", value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="GitHub"
          value={state.github}
          placeholder="https://github.com/you"
          onChange={(value) => set("github", value)}
        />
        <TextField
          label="X"
          value={state.twitter}
          placeholder="https://x.com/you"
          onChange={(value) => set("twitter", value)}
        />
      </div>

      <TextField
        label="Website"
        value={state.website}
        placeholder="https://yoursite.com"
        onChange={(value) => set("website", value)}
      />

      {/* Not editable: rewards are paid to the wallet you are signed in with,
          and letting it be typed is a way to lose money to a typo. */}
      <div className="ws-inset rounded-[14px] px-4 py-3">
        <div className="font-sans text-[12px] font-normal text-white/45">Paid to</div>
        <div className="tnum mt-0.5 font-sans text-[12.5px] break-all text-white/80">
          {walletAddress ?? "Connecting your wallet…"}
        </div>
      </div>

      <button
        type="submit"
        disabled={complete.isPending}
        className="bg-accent text-ink mt-1 cursor-pointer rounded-full px-5 py-3 font-sans text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {complete.isPending ? "Saving…" : (submitLabel ?? "Save profile")}
      </button>
    </form>
  );
}
