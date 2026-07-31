"use client";

import { useState } from "react";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/dashboard/earn/form-field";
import { slugify } from "@/lib/earn/listing-form";
import type { ListingFormErrors, ListingFormState } from "@/lib/earn/listing-form";
import type { AgentAccess, CompensationType, ListingType } from "@/lib/earn/api/types";

const TYPES: { value: ListingType; label: string }[] = [
  { value: "bounty", label: "Bounty" },
  { value: "project", label: "Project" },
  { value: "hackathon", label: "Hackathon" },
  { value: "grant", label: "Grant" },
];

const COMPENSATION: { value: CompensationType; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "range", label: "Range" },
  { value: "variable", label: "Variable" },
];

const AGENT_ACCESS: { value: AgentAccess; label: string }[] = [
  { value: "HUMAN_ONLY", label: "People only" },
  { value: "AGENT_ALLOWED", label: "People and agents" },
  { value: "AGENT_ONLY", label: "Agents only" },
];

const TOKENS = ["USDC", "USDT", "ETH", "SOL"].map((value) => ({ value, label: value }));

const DECIMAL_INPUT = /^\d*\.?\d*$/;

interface ListingFormFieldsProps {
  state: ListingFormState;
  errors: ListingFormErrors;
  onChange: (next: ListingFormState) => void;
  // The slug is fixed once a listing exists, since it is the URL people have.
  slugLocked?: boolean;
}

export function ListingFormFields({
  state,
  errors,
  onChange,
  slugLocked = false,
}: ListingFormFieldsProps) {
  function set<K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) {
    onChange({ ...state, [key]: value });
  }

  // Amount fields reject anything that is not a clean decimal as it is typed,
  // rather than accepting it and failing on submit.
  function setAmount(value: string, apply: (value: string) => void) {
    if (value === "" || DECIMAL_INPUT.test(value)) apply(value);
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Title"
        required
        value={state.title}
        error={errors.title}
        onChange={(value) =>
          onChange({
            ...state,
            title: value,
            slug: slugLocked || state.slug ? state.slug : slugify(value),
          })
        }
      />

      <TextField
        label="Slug"
        required
        value={state.slug}
        error={errors.slug}
        hint={
          slugLocked ? "Fixed once a listing is created." : "Lowercase words joined by hyphens."
        }
        onChange={(value) => {
          if (!slugLocked) set("slug", value);
        }}
      />

      <TextAreaField
        label="Description"
        required
        rows={8}
        value={state.description}
        error={errors.description}
        onChange={(value) => set("description", value)}
        placeholder="What needs building, what done looks like, and anything an applicant has to know."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Type"
          value={state.type}
          options={TYPES}
          onChange={(value) => set("type", value)}
        />
        <TextField label="Region" value={state.region} onChange={(value) => set("region", value)} />
      </div>

      <TextField
        label="Contact link"
        required
        value={state.pocSocials}
        error={errors.pocSocials}
        placeholder="https://t.me/yourhandle"
        hint="Where applicants reach you with questions."
        onChange={(value) => set("pocSocials", value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Deadline"
          type="datetime-local"
          required
          value={state.deadline}
          error={errors.deadline}
          onChange={(value) => set("deadline", value)}
        />
        <TextField
          label="Commitment date"
          type="datetime-local"
          required
          value={state.commitmentDate}
          error={errors.commitmentDate}
          hint="At least a day after the deadline."
          onChange={(value) => set("commitmentDate", value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Token"
          value={state.token}
          options={TOKENS}
          onChange={(value) => set("token", value)}
        />
        <TextField
          label="Total reward"
          required
          value={state.rewardAmount}
          error={errors.rewardAmount}
          placeholder="1000"
          onChange={(value) => setAmount(value, (next) => set("rewardAmount", next))}
        />
      </div>

      <RewardSplit
        state={state}
        error={errors.rewards}
        onChange={(rewards) => set("rewards", rewards)}
        onAmount={setAmount}
      />

      <SkillsField
        state={state}
        error={errors.skills}
        onChange={(skills) => set("skills", skills)}
      />

      <SelectField
        label="Compensation"
        value={state.compensationType}
        options={COMPENSATION}
        onChange={(value) => set("compensationType", value)}
      />

      <SelectField
        label="Who can apply"
        value={state.agentAccess}
        options={AGENT_ACCESS}
        onChange={(value) => set("agentAccess", value)}
      />

      <div className="flex flex-col gap-3 pt-1">
        <CheckboxField
          label="Private listing"
          hint="Kept out of the public feed."
          checked={state.isPrivate}
          onChange={(checked) => set("isPrivate", checked)}
        />
        <CheckboxField
          label="Foundation is paying"
          checked={state.isFndnPaying}
          onChange={(checked) => set("isFndnPaying", checked)}
        />
        <CheckboxField
          label="Pro listing"
          checked={state.isPro}
          onChange={(checked) => set("isPro", checked)}
        />
      </div>
    </div>
  );
}

function RewardSplit({
  state,
  error,
  onChange,
  onAmount,
}: {
  state: ListingFormState;
  error?: string;
  onChange: (rewards: ListingFormState["rewards"]) => void;
  onAmount: (value: string, apply: (value: string) => void) => void;
}) {
  function setTier(index: number, amount: string) {
    onChange(state.rewards.map((tier, i) => (i === index ? { ...tier, amount } : tier)));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-sans text-[12.5px] font-medium text-white/70">
        What each position pays
      </span>

      {state.rewards.map((tier, index) => (
        <div key={tier.position} className="flex items-center gap-2.5">
          <span className="tnum w-12 shrink-0 font-sans text-[12.5px] font-normal text-white/45">
            #{tier.position}
          </span>
          <input
            value={tier.amount}
            aria-label={`Reward for position ${tier.position}`}
            placeholder="0"
            onChange={(event) => onAmount(event.target.value, (next) => setTier(index, next))}
            className="ws-inset focus:border-accent/50 tnum w-full rounded-[12px] px-3.5 py-2.5 font-sans text-[13px] text-white outline-none placeholder:text-white/25"
          />
          {state.rewards.length > 1 ? (
            <button
              type="button"
              onClick={() => onChange(state.rewards.filter((_, i) => i !== index))}
              className="shrink-0 cursor-pointer rounded-full border border-white/10 px-3 py-2 font-sans text-[12px] font-medium text-white/50 transition-colors hover:text-white"
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange([...state.rewards, { position: state.rewards.length + 1, amount: "" }])
        }
        className="ws-inset mt-1 w-fit cursor-pointer rounded-full px-3.5 py-1.5 font-sans text-[12px] font-semibold text-white/70 transition-colors hover:text-white"
      >
        Add a position
      </button>

      {error ? (
        <span role="alert" className="text-down font-sans text-[12px] font-normal">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function parseSkills(text: string): ListingFormState["skills"] {
  return text
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean)
    .map((skill) => ({ skill, subskills: [] }));
}

function joinSkills(skills: ListingFormState["skills"]): string {
  return skills.map((group) => group.skill).join(", ");
}

function SkillsField({
  state,
  error,
  onChange,
}: {
  state: ListingFormState;
  error?: string;
  onChange: (skills: ListingFormState["skills"]) => void;
}) {
  // Skills are a free-text list rather than a picker: the service accepts any
  // string, and hardcoding a taxonomy here would go stale against it.
  //
  // The raw text is held locally because the parsed list is not round-trippable:
  // deriving the field's value from it would delete the comma the moment it was
  // typed, and the sponsor could never reach the second skill.
  const joined = joinSkills(state.skills);
  const [text, setText] = useState(joined);
  // Adjusted during render rather than in an effect, which is what React
  // prescribes for state that follows a prop: an effect here would render the
  // stale text once first and cascade a second render.
  const [lastJoined, setLastJoined] = useState(joined);

  // Only follows the form state when it changed from somewhere else, such as an
  // existing listing being loaded in for editing. A change this field caused
  // itself round-trips to the same string and is left alone, so the comma the
  // sponsor just typed survives.
  if (lastJoined !== joined) {
    setLastJoined(joined);
    if (joinSkills(parseSkills(text)) !== joined) setText(joined);
  }

  return (
    <TextField
      label="Skills"
      required
      value={text}
      error={error}
      placeholder="Frontend, Design"
      hint="Comma separated."
      onChange={(next) => {
        setText(next);
        onChange(parseSkills(next));
      }}
    />
  );
}
