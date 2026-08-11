"use client";

import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/features/earn/components/form-field";
import { slugify } from "@/features/earn/lib/listing-form";
import type {
  EligibilityInput,
  ListingFormErrors,
  ListingFormState,
} from "@/features/earn/lib/listing-form";
import {
  SKILL_CATEGORIES,
  type AgentAccess,
  type CompensationType,
  type ListingType,
  type SkillCategory,
} from "@/features/earn/lib/api/types";

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

// The tokens the service will accept, which is the set in its own registry.
// Offering one it does not hold gets the publish rejected with "Token Not
// Allowed" after the sponsor has filled in the whole form.
//
// Should come from GET /tokens/ rather than being repeated here.
const TOKENS = ["USDC", "USDT", "ETH"].map((value) => ({ value, label: value }));

const DECIMAL_INPUT = /^\d*\.?\d*$/;

const MAX_ELIGIBILITY = 10;

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

      <EligibilityField
        state={state}
        error={errors.eligibility}
        onChange={(eligibility) => set("eligibility", eligibility)}
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

function SkillsField({
  state,
  error,
  onChange,
}: {
  state: ListingFormState;
  error?: string;
  onChange: (skills: ListingFormState["skills"]) => void;
}) {
  // A dropdown rather than a text field: the service takes one of a fixed set
  // and rejects anything else, so free text only produced a validation error
  // the sponsor could not act on.
  const selected = (state.skills[0]?.skill ?? "") as SkillCategory | "";

  return (
    <SelectField
      label="Skill"
      value={selected}
      error={error}
      options={[
        { value: "" as SkillCategory | "", label: "Pick a skill" },
        ...SKILL_CATEGORIES.map((skill) => ({ value: skill as SkillCategory | "", label: skill })),
      ]}
      onChange={(value) => onChange(value ? [{ skill: value, subskills: [] }] : [])}
    />
  );
}

// Questions applicants answer when they enter. Required for a project, which
// the service refuses to publish without any; optional on everything else, so
// the field only insists when it has to.
function EligibilityField({
  state,
  error,
  onChange,
}: {
  state: ListingFormState;
  error?: string;
  onChange: (eligibility: EligibilityInput[]) => void;
}) {
  const required = state.type === "project";

  function set(index: number, patch: Partial<EligibilityInput>) {
    onChange(state.eligibility.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-sans text-[12.5px] font-medium text-white/70">
        Questions for applicants
        {required ? (
          <span className="text-white/35"> *</span>
        ) : (
          <span className="ml-1.5 font-normal text-white/35">optional</span>
        )}
      </span>

      {state.eligibility.map((question, index) => (
        <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={question.question}
            aria-label={`Question ${index + 1}`}
            placeholder="What do you want to know before picking someone?"
            onChange={(event) => set(index, { question: event.target.value })}
            className="ws-inset focus:border-accent/50 w-full rounded-[12px] px-3.5 py-2.5 font-sans text-[13px] text-white outline-none placeholder:text-white/25"
          />
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={question.type}
              aria-label={`Question ${index + 1} answer type`}
              onChange={(event) =>
                set(index, { type: event.target.value === "link" ? "link" : "text" })
              }
              className="ws-inset cursor-pointer rounded-[12px] px-3 py-2.5 font-sans text-[12.5px] font-medium text-white outline-none"
            >
              <option value="text" className="bg-sheet">
                Text
              </option>
              <option value="link" className="bg-sheet">
                Link
              </option>
            </select>
            <label className="flex cursor-pointer items-center gap-1.5 font-sans text-[12px] font-normal text-white/55">
              <input
                type="checkbox"
                checked={question.optional}
                onChange={(event) => set(index, { optional: event.target.checked })}
                className="accent-accent size-3.5 cursor-pointer"
              />
              Optional
            </label>
            <button
              type="button"
              onClick={() => onChange(state.eligibility.filter((_, i) => i !== index))}
              aria-label={`Remove question ${index + 1}`}
              className="cursor-pointer rounded-lg border border-white/12 px-2.5 py-2 font-sans text-[12px] text-white/50 hover:text-white"
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      {state.eligibility.length < MAX_ELIGIBILITY ? (
        <button
          type="button"
          onClick={() =>
            onChange([...state.eligibility, { question: "", type: "text", optional: false }])
          }
          className="cursor-pointer self-start rounded-full border border-white/12 px-3.5 py-1.5 font-sans text-[12px] font-medium text-white/60 transition-colors hover:text-white"
        >
          Add a question
        </button>
      ) : null}

      {error ? (
        <span role="alert" className="text-down font-sans text-[12px] font-normal">
          {error}
        </span>
      ) : null}
    </div>
  );
}
