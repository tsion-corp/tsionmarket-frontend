"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TextAreaField, TextField } from "@/components/dashboard/earn/form-field";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import {
  useCreateSponsor,
  useSponsorNameAvailable,
  useSponsorSlugAvailable,
} from "@/hooks/use-earn-sponsor";
import { useScrollToFirstError } from "@/hooks/use-scroll-to-first-error";
import { slugify } from "@/lib/earn/listing-form";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/lib/toast";

const PAGE = "mx-auto w-full max-w-[620px] px-4 pt-6 pb-20 sm:px-6";

// A link the service will store and a visitor will click, so it has to carry
// its own scheme. Checked with the URL parser rather than a pattern: "is this
// a URL" is exactly what it answers.
function isUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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

// Two steps on screen, one call to the service: it takes the company and the
// owner's profile together. Splitting the form keeps it readable, but nothing
// is sent until both halves are filled, so a company can never exist without an
// owner attached to it.
export function SponsorOnboardingSection({
  startAt = "company",
}: {
  startAt?: "company" | "profile";
}) {
  const router = useRouter();
  const [step, setStep] = useState<"company" | "profile">(startAt);
  const [company, setCompany] = useState<CompanyState | null>(null);

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
        {step === "company" || !company ? (
          <CompanyStep
            initial={company}
            onNext={(next) => {
              setCompany(next);
              setStep("profile");
            }}
          />
        ) : (
          <ProfileStep company={company} onDone={() => router.push("/earn/sponsor")} />
        )}
      </div>
    </div>
  );
}

function CompanyStep({
  initial,
  onNext,
}: {
  initial: CompanyState | null;
  onNext: (company: CompanyState) => void;
}) {
  const [state, setState] = useState<CompanyState>(
    initial ?? {
      name: "",
      slug: "",
      bio: "",
      logo: "",
      industry: "",
      url: "",
      twitter: "",
      entityName: "",
    }
  );
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyState, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);
  useScrollToFirstError(formRef, errors);
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
    // A logo is optional: the service accepts a company without one and the
    // sponsor pages render it, so requiring artwork here would block onboarding
    // for no reason.
    if (!state.industry.trim()) next.industry = "Pick an industry.";
    if (!state.url.trim()) next.url = "Add your website.";
    else if (!isUrl(state.url)) next.url = "That doesn't look like a full URL.";
    if (!state.twitter.trim()) next.twitter = "Add your X profile.";
    else if (!isUrl(state.twitter)) next.twitter = "That doesn't look like a full URL.";
    if (!state.entityName.trim()) next.entityName = "Add the legal entity name.";
    if (nameTaken) next.name = "That name is taken.";
    if (slugTaken) next.slug = "That slug is taken.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    // Nothing is sent yet: the service takes the company and the owner together,
    // so this only carries the company forward to the second step.
    onNext(state);
  }

  return (
    // noValidate: this form reports its own errors inline. Leaving the browser's
    // native validation on would block submit before our checks run, and show a
    // second set of messages we do not control.
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
        hint={slugTaken ? undefined : slug.isChecking ? "Checking…" : "tsionark.com/earn/your-slug"}
        onChange={(value) => {
          setSlugTouched(true);
          set("slug", value);
        }}
      />

      <ImageUploadField
        label="Logo"
        source="sponsor"
        value={state.logo}
        error={errors.logo}
        onChange={(url) => set("logo", url)}
        hint="Optional. PNG, JPEG or WebP, up to 5MB."
      />

      <TextAreaField
        label="What your company does"
        required
        rows={4}
        maxLength={180}
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
        required
        value={state.url}
        error={errors.url}
        placeholder="https://example.com"
        onChange={(value) => set("url", value)}
      />

      <TextField
        label="X profile"
        type="url"
        required
        value={state.twitter}
        error={errors.twitter}
        placeholder="https://x.com/yourcompany"
        onChange={(value) => set("twitter", value)}
      />

      <TextField
        label="Legal entity name"
        required
        value={state.entityName}
        error={errors.entityName}
        hint="The registered name, if it differs from your company name."
        onChange={(value) => set("entityName", value)}
      />

      <button
        type="submit"
        className="bg-accent text-ink mt-2 cursor-pointer rounded-full px-5 py-3 font-sans text-[13px] font-semibold"
      >
        Continue
      </button>
    </form>
  );
}

function ProfileStep({ company, onDone }: { company: CompanyState; onDone: () => void }) {
  const create = useCreateSponsor();
  const [state, setState] = useState<ProfileState>({
    firstName: "",
    lastName: "",
    username: "",
    photo: "",
    telegram: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileState, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);
  useScrollToFirstError(formRef, errors);

  function set<K extends keyof ProfileState>(key: K, value: ProfileState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next: Partial<Record<keyof ProfileState, string>> = {};
    if (!state.firstName.trim()) next.firstName = "Add your first name.";
    if (!state.lastName.trim()) next.lastName = "Add your last name.";
    if (!state.username.trim()) next.username = "Pick a username.";
    if (!state.telegram.trim()) next.telegram = "Add your Telegram.";
    setErrors(next);
    if (Object.keys(next).length) return;

    // Both halves go up together, which is why the company is only created at
    // the end of the second step rather than at the end of the first.
    const id = toast.loading("Setting up your company…");
    try {
      await create.mutateAsync({
        company: {
          name: company.name.trim(),
          slug: company.slug.trim(),
          bio: company.bio.trim(),
          logo: company.logo,
          industry: company.industry.trim(),
          url: company.url.trim(),
          twitter: company.twitter.trim(),
          entityName: company.entityName.trim(),
        },
        owner: {
          firstName: state.firstName.trim(),
          lastName: state.lastName.trim(),
          username: state.username.trim(),
          photo: state.photo,
          telegram: state.telegram.trim(),
        },
      });
      toast.success("You're all set.", { id });
      onDone();
    } catch (error) {
      const message = friendlyError(error, "Couldn't set up that company.");
      toast.error(message, { id });
      // A taken username can only be caught server-side. Route it back to the
      // field it's about rather than leaving it as a passing toast.
      if (/username/i.test(message)) setErrors((prev) => ({ ...prev, username: message }));
    }
  }

  return (
    // noValidate: this form reports its own errors inline. Leaving the browser's
    // native validation on would block submit before our checks run, and show a
    // second set of messages we do not control.
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
        hint="Optional. PNG, JPEG or WebP, up to 5MB."
      />
      <TextField
        label="Telegram"
        required
        value={state.telegram}
        error={errors.telegram}
        placeholder="https://t.me/yourhandle"
        hint="How applicants reach you once they've entered."
        onChange={(value) => set("telegram", value)}
      />

      <button
        type="submit"
        disabled={create.isPending}
        className="bg-accent text-ink mt-2 cursor-pointer rounded-full px-5 py-3 font-sans text-[13px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {create.isPending ? "Setting up…" : "Finish"}
      </button>
    </form>
  );
}
