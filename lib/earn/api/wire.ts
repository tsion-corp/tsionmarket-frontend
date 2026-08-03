// Wire shapes from the earn service, and the normalizers that turn them into
// our domain types. A change to the service contract stops here.
//
// The earn contract documents request bodies but not response bodies, so these
// interfaces are derived from the documented entity fields and every one of
// them is optional. The normalizers fall back rather than throw: if the service
// renames a field, one value on a card goes blank instead of the whole browse
// screen erroring out. Anything genuinely required to act on a record (an id, a
// slug) is checked by the caller.

import { rewardFromApi } from "@/lib/earn/reward";
import { SKILL_CATEGORIES } from "@/lib/earn/api/types";
import type {
  AgentAccess,
  CompensationType,
  EligibilityAnswer,
  EligibilityQuestion,
  Listing,
  ListingStatus,
  ListingSummary,
  ListingType,
  RewardTier,
  SkillCategory,
  SkillGroup,
  Sponsor,
  SponsorListing,
  SponsorRef,
  Submission,
  SubmissionApplicant,
  TalentProfile,
  SubmissionCheck,
  SubmissionStatus,
} from "@/lib/earn/api/types";

export interface SponsorWire {
  id?: string;
  name?: string;
  slug?: string;
  logo?: string | null;
  bio?: string | null;
  industry?: string | null;
  url?: string | null;
  twitter?: string | null;
  entityName?: string | null;
}

export interface SkillWire {
  skills?: string;
  subskills?: string[];
}

export interface EligibilityWire {
  id?: string;
  question?: string;
  type?: string;
  optional?: boolean;
}

export interface ListingWire {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  region?: string;
  deadline?: string | null;
  commitmentDate?: string | null;
  pocSocials?: string | null;
  token?: string;
  rewardAmount?: number | string; // service sends numeric strings (e.g. "1000")
  rewards?: Record<string, number> | null;
  compensationType?: string;
  isPrivate?: boolean;
  isPro?: boolean;
  isFndnPaying?: boolean;
  isPublished?: boolean;
  winnersAnnounced?: boolean;
  agentAccess?: string;
  skills?: SkillWire[];
  eligibility?: EligibilityWire[];
  _count?: { Submission?: number } | null;
  submissionCount?: number;
  sponsor?: SponsorWire | null;
}

export interface SubmissionWire {
  id?: string;
  listingId?: string;
  link?: string | null;
  tweet?: string | null;
  otherInfo?: string | null;
  telegram?: string | null;
  status?: string;
  label?: string;
  isWinner?: boolean;
  winnerPosition?: number | null;
  createdAt?: string | null;
  eligibilityAnswers?: { question?: string; answer?: string }[] | null;
  user?: {
    id?: string;
    username?: string;
    photo?: string | null;
    telegram?: string | null;
  } | null;
}

export interface SubmissionCheckWire {
  hasSubmitted?: boolean;
  submissionId?: string | null;
  isWinner?: boolean;
  winnerPosition?: number | null;
  winnersAnnounced?: boolean;
  kycVerified?: boolean;
  isPaid?: boolean;
}

const LISTING_TYPES: ListingType[] = ["bounty", "project", "hackathon", "grant"];
const LISTING_STATUSES: ListingStatus[] = ["open", "review", "completed", "closed"];
const COMPENSATION_TYPES: CompensationType[] = ["fixed", "range", "variable"];
const AGENT_ACCESS: AgentAccess[] = ["HUMAN_ONLY", "AGENT_ALLOWED", "AGENT_ONLY"];

function oneOf<T extends string>(options: T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (options as string[]).includes(value)
    ? (value as T)
    : fallback;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// Empty strings become null so a screen can test presence rather than checking
// for "" everywhere a link or a logo is optional.
function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function flag(value: unknown): boolean {
  return value === true;
}

export function toSponsorRef(wire: SponsorWire | null | undefined): SponsorRef | null {
  // The feed identifies a sponsor by slug (public pages are slug-based) and does
  // not always send an id, so accept the sponsor as long as it has a name or
  // slug — only a truly empty object yields null. id falls back to the slug.
  if (!wire || (!wire.id && !wire.slug && !wire.name)) return null;
  return {
    id: wire.id ?? wire.slug ?? "",
    name: text(wire.name),
    slug: text(wire.slug),
    logo: optionalText(wire.logo),
  };
}

export interface TalentProfileWire {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  photo?: string | null;
  bio?: string | null;
  location?: string | null;
  skills?: unknown;
  twitter?: string | null;
  github?: string | null;
  linkedin?: string | null;
  telegram?: string | null;
  website?: string | null;
  discord?: string | null;
  walletAddress?: string | null;
  isTalentFilled?: boolean;
}

// Talent skills are stored as free-form JSON, so anything that does not look
// like a skill group is dropped rather than trusted. Unlike a listing's skills
// these are not restricted to the known categories: a person may describe
// themselves with something the taxonomy has not caught up with.
function toTalentSkills(value: unknown): SkillGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (group): group is { skills: string; subskills?: unknown } =>
        !!group &&
        typeof group === "object" &&
        isNonEmptyString((group as { skills?: unknown }).skills)
    )
    .map((group) => ({
      skill: group.skills,
      subskills: Array.isArray(group.subskills) ? group.subskills.filter(isNonEmptyString) : [],
    }));
}

export function toTalentProfile(wire: TalentProfileWire | null | undefined): TalentProfile | null {
  if (!wire?.id) return null;
  return {
    id: wire.id,
    firstName: text(wire.firstName),
    lastName: text(wire.lastName),
    username: text(wire.username),
    photo: optionalText(wire.photo),
    bio: optionalText(wire.bio),
    location: optionalText(wire.location),
    skills: toTalentSkills(wire.skills),
    twitter: optionalText(wire.twitter),
    github: optionalText(wire.github),
    linkedin: optionalText(wire.linkedin),
    telegram: optionalText(wire.telegram),
    website: optionalText(wire.website),
    discord: optionalText(wire.discord),
    walletAddress: optionalText(wire.walletAddress),
    isTalentFilled: flag(wire.isTalentFilled),
  };
}

export function toSponsor(wire: SponsorWire): Sponsor | null {
  const ref = toSponsorRef(wire);
  if (!ref) return null;
  return {
    ...ref,
    bio: text(wire.bio),
    industry: text(wire.industry),
    url: optionalText(wire.url),
    twitter: optionalText(wire.twitter),
    entityName: optionalText(wire.entityName),
  };
}

// Skills come back as one of a fixed set. A value outside it is dropped rather
// than carried through: the form can only offer the known categories, so an
// unknown one would be invisible in the editor and then silently deleted on the
// next save.
function toSkillGroups(wire: SkillWire[] | undefined): SkillGroup[] {
  if (!Array.isArray(wire)) return [];
  return wire
    .filter((group): group is SkillWire & { skills: SkillCategory } =>
      (SKILL_CATEGORIES as readonly string[]).includes(group?.skills ?? "")
    )
    .map((group) => ({
      skill: group.skills,
      subskills: Array.isArray(group.subskills) ? group.subskills.filter(isNonEmptyString) : [],
    }));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// The service keys rewards by position as a string: { "1": 1000, "2": 500 }.
// Positions are sorted numerically so second place never renders above first
// just because "10" sorts before "2" as text.
function toRewardTiers(
  rewards: Record<string, number> | null | undefined,
  token: unknown
): RewardTier[] {
  if (!rewards || typeof rewards !== "object") return [];
  return Object.entries(rewards)
    .map(([position, amount]) => ({
      position: Number(position),
      amount: rewardFromApi(amount, token),
    }))
    .filter(
      (tier): tier is RewardTier =>
        Number.isInteger(tier.position) && tier.position > 0 && tier.amount !== null
    )
    .sort((a, b) => a.position - b.position);
}

function toEligibility(wire: EligibilityWire[] | undefined): EligibilityQuestion[] {
  if (!Array.isArray(wire)) return [];
  return wire
    .filter((q): q is EligibilityWire & { question: string } => isNonEmptyString(q?.question))
    .map((q, index) => ({
      id: text(q.id, String(index)),
      question: q.question,
      type: q.type === "link" ? "link" : "text",
      optional: flag(q.optional),
    }));
}

function submissionCountOf(wire: ListingWire): number {
  if (typeof wire.submissionCount === "number") return wire.submissionCount;
  const counted = wire._count?.Submission;
  return typeof counted === "number" ? counted : 0;
}

export function toListingSummary(wire: ListingWire): ListingSummary | null {
  if (!wire?.id || !wire.slug) return null;
  return {
    id: wire.id,
    slug: wire.slug,
    title: text(wire.title, "Untitled listing"),
    type: oneOf(LISTING_TYPES, wire.type, "bounty"),
    status: oneOf(LISTING_STATUSES, wire.status, "open"),
    region: text(wire.region, "Global"),
    deadline: optionalText(wire.deadline),
    reward: rewardFromApi(wire.rewardAmount, wire.token),
    compensationType: oneOf(COMPENSATION_TYPES, wire.compensationType, "fixed"),
    isPrivate: flag(wire.isPrivate),
    isPro: flag(wire.isPro),
    winnersAnnounced: flag(wire.winnersAnnounced),
    submissionCount: submissionCountOf(wire),
    sponsor: toSponsorRef(wire.sponsor),
  };
}

export function toListing(wire: ListingWire): Listing | null {
  const summary = toListingSummary(wire);
  if (!summary) return null;
  return {
    ...summary,
    description: text(wire.description),
    commitmentDate: optionalText(wire.commitmentDate),
    pocSocials: optionalText(wire.pocSocials),
    skills: toSkillGroups(wire.skills),
    rewards: toRewardTiers(wire.rewards, wire.token),
    isFndnPaying: flag(wire.isFndnPaying),
    agentAccess: oneOf(AGENT_ACCESS, wire.agentAccess, "HUMAN_ONLY"),
    eligibility: toEligibility(wire.eligibility),
    isPublished: flag(wire.isPublished),
  };
}

// The sponsor's own feed, which is the only one carrying unpublished work.
// `isPublished` stays null when the field is absent rather than defaulting to
// false, so a service that stops sending it empties the drafts screen instead
// of filling it with live listings.
export function toSponsorListing(wire: ListingWire): SponsorListing | null {
  const summary = toListingSummary(wire);
  if (!summary) return null;
  return {
    ...summary,
    isPublished: typeof wire.isPublished === "boolean" ? wire.isPublished : null,
  };
}

export function toSponsorListings(wire: ListingWire[] | null | undefined): SponsorListing[] {
  if (!Array.isArray(wire)) return [];
  return wire
    .map(toSponsorListing)
    .filter((listing): listing is SponsorListing => listing !== null);
}

// A listing that fails to normalize is dropped from the feed rather than
// rendered half-built. Losing one card beats a screen that cannot be opened.
export function toListingSummaries(wire: ListingWire[] | null | undefined): ListingSummary[] {
  if (!Array.isArray(wire)) return [];
  return wire
    .map(toListingSummary)
    .filter((listing): listing is ListingSummary => listing !== null);
}

// The service reports a winner with a flag and a position rather than a single
// status field, so the three states are derived here instead of in the UI.
function toSubmissionStatus(wire: SubmissionWire): SubmissionStatus {
  if (flag(wire.isWinner)) return "winner";
  const label = wire.status ?? wire.label;
  return label === "rejected" || label === "Rejected" ? "rejected" : "pending";
}

function toApplicant(wire: SubmissionWire["user"]): SubmissionApplicant | null {
  if (!wire?.id) return null;
  return {
    id: wire.id,
    username: text(wire.username, "Unknown"),
    photo: optionalText(wire.photo),
    telegram: optionalText(wire.telegram),
  };
}

function toEligibilityAnswers(wire: SubmissionWire["eligibilityAnswers"]): EligibilityAnswer[] {
  if (!Array.isArray(wire)) return [];
  return wire
    .filter((a): a is { question: string; answer?: string } => isNonEmptyString(a?.question))
    .map((a) => ({ question: a.question, answer: text(a.answer) }));
}

export function toSubmission(wire: SubmissionWire): Submission | null {
  if (!wire?.id) return null;
  return {
    id: wire.id,
    listingId: text(wire.listingId),
    link: optionalText(wire.link),
    tweet: optionalText(wire.tweet),
    otherInfo: optionalText(wire.otherInfo),
    telegram: optionalText(wire.telegram),
    status: toSubmissionStatus(wire),
    winnerPosition: typeof wire.winnerPosition === "number" ? wire.winnerPosition : null,
    createdAt: optionalText(wire.createdAt),
    eligibilityAnswers: toEligibilityAnswers(wire.eligibilityAnswers),
    applicant: toApplicant(wire.user),
  };
}

export function toSubmissions(wire: SubmissionWire[] | null | undefined): Submission[] {
  if (!Array.isArray(wire)) return [];
  return wire.map(toSubmission).filter((s): s is Submission => s !== null);
}

export function toSubmissionCheck(wire: SubmissionCheckWire | null | undefined): SubmissionCheck {
  return {
    hasSubmitted: flag(wire?.hasSubmitted),
    submissionId: optionalText(wire?.submissionId),
    isWinner: flag(wire?.isWinner),
    winnerPosition: typeof wire?.winnerPosition === "number" ? wire.winnerPosition : null,
    winnersAnnounced: flag(wire?.winnersAnnounced),
    kycVerified: flag(wire?.kycVerified),
    isPaid: flag(wire?.isPaid),
  };
}
