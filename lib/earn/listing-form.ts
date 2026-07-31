// Listing form state, its rules, and the payload the service expects.
//
// Pure: no React, no fetch. The rules the service enforces on publish are
// checked here first so a sponsor sees "the commitment date has to be at least
// a day after the deadline" under the field, rather than as a red toast after a
// round trip.

import { parseRewardInput, rewardFrom, rewardToApi, sumRewards } from "@/lib/earn/reward";
import type {
  AgentAccess,
  CompensationType,
  Listing,
  ListingType,
  RewardTier,
  SkillGroup,
} from "@/lib/earn/api/types";

export const ONE_DAY_MS = 86_400_000;

// Lowercase words joined by single hyphens. Matches what the service's slug
// checker accepts and what reads correctly in a URL.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface RewardTierInput {
  position: number;
  // What the sponsor typed, not a number. Parsed at the boundary.
  amount: string;
}

export interface ListingFormState {
  title: string;
  slug: string;
  description: string;
  type: ListingType;
  region: string;
  pocSocials: string;
  // Both hold a datetime-local value ("2026-12-31T23:59"), not an ISO string.
  deadline: string;
  commitmentDate: string;
  token: string;
  rewardAmount: string;
  rewards: RewardTierInput[];
  skills: SkillGroup[];
  compensationType: CompensationType;
  isPrivate: boolean;
  isFndnPaying: boolean;
  agentAccess: AgentAccess;
  isPro: boolean;
}

export type ListingFormErrors = Partial<Record<keyof ListingFormState, string>>;

export interface ListingPayload {
  title: string;
  slug: string;
  pocSocials: string;
  description: string;
  type: ListingType;
  region: string;
  deadline: string;
  commitmentDate: string;
  skills: { skills: string; subskills: string[] }[];
  token: string;
  rewardAmount: number;
  rewards: Record<string, number>;
  compensationType: CompensationType;
  isPrivate: boolean;
  isFndnPaying: boolean;
  agentAccess: AgentAccess;
  isPro: boolean;
  // Set when updating an existing draft rather than creating one.
  id?: string;
}

export function emptyListingForm(): ListingFormState {
  return {
    title: "",
    slug: "",
    description: "",
    type: "bounty",
    region: "Global",
    pocSocials: "",
    deadline: "",
    commitmentDate: "",
    token: "USDC",
    rewardAmount: "",
    rewards: [{ position: 1, amount: "" }],
    skills: [],
    compensationType: "fixed",
    isPrivate: false,
    isFndnPaying: false,
    agentAccess: "HUMAN_ONLY",
    isPro: false,
  };
}

// Turns a title into a starting slug. The sponsor can still edit it, and the
// service has the final say on whether it is taken.
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// A stored listing back into editable form state, for the update screen.
export function listingToForm(listing: Listing): ListingFormState {
  return {
    title: listing.title,
    slug: listing.slug,
    description: listing.description,
    type: listing.type,
    region: listing.region,
    pocSocials: listing.pocSocials ?? "",
    deadline: toLocalInput(listing.deadline),
    commitmentDate: toLocalInput(listing.commitmentDate),
    token: listing.reward?.token ?? "USDC",
    rewardAmount: listing.reward ? unitsOf(listing.reward.minor, listing.reward.decimals) : "",
    rewards: listing.rewards.length
      ? listing.rewards.map((tier) => ({
          position: tier.position,
          amount: unitsOf(tier.amount.minor, tier.amount.decimals),
        }))
      : [{ position: 1, amount: "" }],
    skills: listing.skills,
    compensationType: listing.compensationType,
    isPrivate: listing.isPrivate,
    isFndnPaying: listing.isFndnPaying,
    agentAccess: listing.agentAccess,
    isPro: listing.isPro,
  };
}

// A draft may be half-finished. A publish may not, and it also has to satisfy
// the date and reward rules the service checks.
export function validateListingForm(
  state: ListingFormState,
  { forPublish }: { forPublish: boolean }
): ListingFormErrors {
  const errors: ListingFormErrors = {};

  if (!state.title.trim()) errors.title = "Give the listing a title.";
  if (!state.slug.trim()) errors.slug = "Give the listing a slug.";
  else if (!SLUG_PATTERN.test(state.slug)) {
    errors.slug = "Use lowercase letters, numbers and single hyphens.";
  }

  const rewardError = rewardAmountError(state);
  if (rewardError) errors.rewardAmount = rewardError;

  if (!forPublish) return errors;

  if (!state.description.trim()) errors.description = "Describe what needs building.";
  if (!state.pocSocials.trim()) errors.pocSocials = "Add a contact link for applicants.";
  if (!state.skills.length) errors.skills = "Pick at least one skill.";
  if (!state.rewardAmount.trim()) errors.rewardAmount ??= "Set the total reward.";

  const dateErrors = dateRuleErrors(state);
  Object.assign(errors, dateErrors);

  const splitError = rewardSplitError(state);
  if (splitError && !errors.rewardAmount) errors.rewards = splitError;

  return errors;
}

// The service rejects a publish whose commitment date is under a day after the
// deadline, so the same rule is applied here first.
function dateRuleErrors(state: ListingFormState): ListingFormErrors {
  const errors: ListingFormErrors = {};
  const deadline = parseLocalInput(state.deadline);
  const commitment = parseLocalInput(state.commitmentDate);

  if (deadline === null) {
    errors.deadline = "Set a deadline.";
  }
  if (commitment === null) {
    errors.commitmentDate = "Set a commitment date.";
  }
  if (deadline === null || commitment === null) return errors;

  if (commitment - deadline < ONE_DAY_MS) {
    errors.commitmentDate = "The commitment date has to be at least a day after the deadline.";
  }
  return errors;
}

function rewardAmountError(state: ListingFormState): string | undefined {
  if (!state.rewardAmount.trim()) return undefined;
  try {
    const total = parseRewardInput(state.rewardAmount, state.token);
    if (total <= 0n) return "The reward has to be more than zero.";
  } catch (error) {
    return (error as Error).message;
  }
  return undefined;
}

// Every position the sponsor filled in has to add up to the total they
// promised, or somebody gets paid the wrong amount.
function rewardSplitError(state: ListingFormState): string | undefined {
  const filled = state.rewards.filter((tier) => tier.amount.trim() !== "");
  if (!filled.length) return "Set what each position pays.";

  let tiers: RewardTier[];
  let total: bigint;
  try {
    total = parseRewardInput(state.rewardAmount, state.token);
    tiers = filled.map((tier) => ({
      position: tier.position,
      amount: rewardFrom(parseRewardInput(tier.amount, state.token), state.token),
    }));
  } catch (error) {
    return (error as Error).message;
  }

  const split = sumRewards(tiers);
  if (split !== total) return "The positions have to add up to the total reward.";
  return undefined;
}

// Builds the body the service expects. Throws rather than sending a malformed
// reward: callers validate first, so reaching this with bad input is a bug.
export function buildListingPayload(state: ListingFormState, id?: string): ListingPayload {
  const total = parseRewardInput(state.rewardAmount, state.token);
  const rewards: Record<string, number> = {};
  for (const tier of state.rewards) {
    if (!tier.amount.trim()) continue;
    const amount = rewardFrom(parseRewardInput(tier.amount, state.token), state.token);
    rewards[String(tier.position)] = rewardToApi(amount);
  }

  return {
    title: state.title.trim(),
    slug: state.slug.trim(),
    pocSocials: state.pocSocials.trim(),
    description: state.description.trim(),
    type: state.type,
    region: state.region,
    deadline: toIso(state.deadline),
    commitmentDate: toIso(state.commitmentDate),
    skills: state.skills.map((group) => ({ skills: group.skill, subskills: group.subskills })),
    token: state.token,
    rewardAmount: rewardToApi(rewardFrom(total, state.token)),
    rewards,
    compensationType: state.compensationType,
    isPrivate: state.isPrivate,
    isFndnPaying: state.isFndnPaying,
    agentAccess: state.agentAccess,
    isPro: state.isPro,
    ...(id ? { id } : {}),
  };
}

// ----- date helpers -----

// A datetime-local value is local wall time with no zone. Date parses it as
// local, which is what the sponsor meant.
function parseLocalInput(value: string): number | null {
  if (!value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function toIso(value: string): string {
  const ms = parseLocalInput(value);
  return ms === null ? "" : new Date(ms).toISOString();
}

// The inverse, for loading a stored listing back into the form. Trimmed to
// minutes because that is all datetime-local accepts.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

// Minor units back to the decimal string the form shows, with no trailing
// zeroes so an amount reads the way it was typed.
function unitsOf(minor: string, decimals: number): string {
  const negative = minor.startsWith("-");
  const digits = (negative ? minor.slice(1) : minor).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals ? digits.slice(digits.length - decimals).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
