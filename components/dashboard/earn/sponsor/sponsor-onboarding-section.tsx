"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TextAreaField, TextField } from "@/components/dashboard/earn/form-field";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import {
  useCreateSponsor,
  useSaveSponsorProfile,
  useSponsorNameAvailable,
  useSponsorSlugAvailable,
} from "@/hooks/use-earn-sponsor";
import { slugify } from "@/lib/earn/listing-form";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const PAGE = "mx-auto w-full max-w-[620px] px-4 pt-6 pb-20 sm:px-6";

interface CompanyState {
  name: string;
  slug: string;
  bio: string;
  logo: string;
  industry: string;
  url: string;
  twitter: string;
  entityName: string;
}

interface ProfileState {
  firstName: string;
  lastName: string;
  username: string;
  photo: string;
  telegram: string;
}

// Two steps, because the service takes them as two calls: the company record
// first, then the owner's own profile. The company step is what unlocks the
// sponsor dashboard, so a user who drops out after step one still has a working
// account and is sent back here to finish.
export function SponsorOnboardingSection({
  startAt = "company",
}: {
  startAt?: "company" | "profile";
}) {
  const router = useRouter();
  const [step, setStep] = useState<"company" | "profile">(startAt);

  return (
    <div className={PAGE}>
      <h1 className="ws-display text-[clamp(24px,3.4vw,32px)] tracking-[-0.02em] text-white">
        {step === "company" ? "Set up your company" : "Your details"}
      </h1>
      <p className="mt-1.5 font-sans text-[13px] font-normal text-white/50">
        {step === "company"
          ? "This is what people see on every listing you post."
          : "How applicants reach you once they've entered."}
      </p>

      <div className="mt-7">
        {step === "company" ? (
          <CompanyStep onDone={() => setStep("profile")} />
        ) : (
          <ProfileStep onDone={() => router.push("/earn/sponsor")} />
        )}
      </div>
    </div>
  );
}

function CompanyStep({ onDone }: { onDone: () => void }) {
  const create = useCreateSponsor();
  const [state, setState] = useState<CompanyState>({
    name: "",
    slug: "",
    bio: "",
    logo: "",
    industry: "",
    url: "",
    twitter: "",
    entityName: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyState, string>>>({});
  // Once the slug has been edited by hand it stops tracking the name, so a
  // deliberate slug is not overwritten by the next keystroke in the title.
  const [slugTouched, setSlugTouched] = useState(false);

  const name = useSponsorNameAvailable(state.name);
  const slug = useSponsorSlugAvailable(state.slug);

  const nameTaken = name.available === false && name.checked === state.name.trim();
  const slugTaken = slug.available === false && slug.checked === state.slug.trim();

  function set<K extends keyof CompanyState>(key: K, value: CompanyState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: Partial<Record<keyof CompanyState, string>> = {};
    if (!state.name.trim()) next.name = "Give your company a name.";
    if (!state.slug.trim()) next.slug = "Pick a slug for your page.";
    if (!state.bio.trim()) next.bio = "Say what your company does.";
    if (!state.logo) next.logo = "Upload a logo.";
    if (!state.industry.trim()) next.industry = "Pick an industry.";
    if (nameTaken) next.name = "That name is taken.";
    if (slugTaken) next.slug = "That slug is taken.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;

    const id = toast.loading("Creating your company…");
    try {
      await create.mutateAsync({
        name: state.name.trim(),
        slug: state.slug.trim(),
        bio: state.bio.trim(),
        logo: state.logo,
        industry: state.industry.trim(),
        url: state.url.trim(),
        twitter: state.twitter.trim(),
        entityName: state.entityName.trim() || state.name.trim(),
      });
      toast.success("Company created.", { id });
      onDone();
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't create that company."), { id });
    }
  }

  return (
    // noValidate: this form reports its own errors inline. Leaving the browser's
    // native validation on would block submit before our checks run, and show a
    // second set of messages we do not control.
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <TextField
        label="Company name"
        required
        value={state.name}
        error={errors.name}
        hint={nameTaken ? undefined : name.isChecking ? "Checking…" : undefined}
        onChange={(value) => {
          set("name", value);
          if (!slugTouched) set("slug", slugify(value));
        }}
      />

      <TextField
        label="Page slug"
        required
        value={state.slug}
        error={errors.slug}
        hint={
          slugTaken ? undefined : slug.isChecking ? "Checking…" : "worldstreet.com/earn/your-slug"
        }
        onChange={(value) => {
          setSlugTouched(true);
          set("slug", value);
        }}
      />

      <ImageUploadField
        label="Logo"
        source="sponsor"
        required
        value={state.logo}
        error={errors.logo}
        onChange={(url) => set("logo", url)}
        hint="PNG, JPEG or WebP, up to 5MB."
      />

      <TextAreaField
        label="What your company does"
        required
        rows={4}
        value={state.bio}
        error={errors.bio}
        onChange={(value) => set("bio", value)}
      />

      <TextField
        label="Industry"
        required
        value={state.industry}
        error={errors.industry}
        placeholder="DeFi"
        onChange={(value) => set("industry", value)}
      />

      <TextField
        label="Website"
        type="url"
        value={state.url}
        placeholder="https://example.com"
        onChange={(value) => set("url", value)}
      />

      <TextField
        label="X profile"
        type="url"
        value={state.twitter}
        placeholder="https://x.com/yourcompany"
        onChange={(value) => set("twitter", value)}
      />

      <TextField
        label="Legal entity name"
        value={state.entityName}
        hint="Defaults to your company name."
        onChange={(value) => set("entityName", value)}
      />

      <button
        type="submit"
        disabled={create.isPending}
        className="bg-accent text-ink mt-2 cursor-pointer rounded-full px-5 py-3 font-sans text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {create.isPending ? "Creating…" : "Create company"}
      </button>
    </form>
  );
}

function ProfileStep({ onDone }: { onDone: () => void }) {
  const save = useSaveSponsorProfile();
  const [state, setState] = useState<ProfileState>({
    firstName: "",
    lastName: "",
    username: "",
    photo: "",
    telegram: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileState, string>>>({});

  function set<K extends keyof ProfileState>(key: K, value: ProfileState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next: Partial<Record<keyof ProfileState, string>> = {};
    if (!state.firstName.trim()) next.firstName = "Add your first name.";
    if (!state.lastName.trim()) next.lastName = "Add your last name.";
    if (!state.username.trim()) next.username = "Pick a username.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const id = toast.loading("Saving your details…");
    try {
      await save.mutateAsync({
        firstName: state.firstName.trim(),
        lastName: state.lastName.trim(),
        username: state.username.trim(),
        photo: state.photo,
        telegram: state.telegram.trim(),
      });
      toast.success("You're all set.", { id });
      onDone();
    } catch (error) {
      toast.error(friendlyError(error, "Couldn't save those details."), { id });
    }
  }

  return (
    // noValidate: this form reports its own errors inline. Leaving the browser's
    // native validation on would block submit before our checks run, and show a
    // second set of messages we do not control.
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
      <TextField
        label="Username"
        required
        value={state.username}
        error={errors.username}
        onChange={(value) => set("username", value)}
      />
      <ImageUploadField
        label="Photo"
        source="user"
        value={state.photo}
        onChange={(url) => set("photo", url)}
        hint="PNG, JPEG or WebP, up to 5MB."
      />
      <TextField
        label="Telegram"
        value={state.telegram}
        placeholder="https://t.me/yourhandle"
        onChange={(value) => set("telegram", value)}
      />

      <button
        type="submit"
        disabled={save.isPending}
        className="bg-accent text-ink mt-2 cursor-pointer rounded-full px-5 py-3 font-sans text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {save.isPending ? "Saving…" : "Finish"}
      </button>
    </form>
  );
}
