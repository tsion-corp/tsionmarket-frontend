// Domain types for the earn service. These are our types, not the wire format:
// every response passes through a normalizer in wire.ts before a component
// sees it.
//
// Reward amounts follow the platform rule that money is exact. The earn API
// sends and receives them as JSON numbers, so the float lives at the wire
// boundary and nowhere else: inside the app a reward is an integer count of
// the token's smallest unit.

export interface RewardAmount {
  // Exact amount in the token's smallest unit, as a decimal string. Never
  // parsed into a float for arithmetic.
  minor: string;
  token: string;
  decimals: number;
}

export type ListingType = "bounty" | "project" | "hackathon" | "grant";

export type ListingStatus = "open" | "review" | "completed" | "closed";

export type CompensationType = "fixed" | "range" | "variable";

// Whether an AI agent may work the listing. The service spells these in caps.
export type AgentAccess = "HUMAN_ONLY" | "AGENT_ALLOWED" | "AGENT_ONLY";

// The service takes one of a fixed set and rejects anything else, so this is
// the list the picker offers. Read off its validation error rather than guessed.
export const SKILL_CATEGORIES = [
  "Frontend",
  "Backend",
  "Blockchain",
  "Mobile",
  "Design",
  "Community",
  "Growth",
  "Content",
  "Other",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export interface SkillGroup {
  skill: string;
  subskills: string[];
}

// One payout position. `position` is 1-based, matching the service's rewards
// map where the key "1" is first place.
export interface RewardTier {
  position: number;
  amount: RewardAmount;
}

export interface SponsorRef {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

export interface Sponsor extends SponsorRef {
  bio: string;
  industry: string;
  url: string | null;
  twitter: string | null;
  entityName: string | null;
}

// The caller's own account. `isTalentFilled` is the one field that decides
// whether they may enter a listing at all: the service refuses a submission
// from an incomplete profile.
export interface TalentProfile {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  photo: string | null;
  bio: string | null;
  location: string | null;
  skills: SkillGroup[];
  twitter: string | null;
  github: string | null;
  linkedin: string | null;
  telegram: string | null;
  website: string | null;
  discord: string | null;
  walletAddress: string | null;
  isTalentFilled: boolean;
}

// What the profile form sends. Only a name and a username are required; the
// rest is what a sponsor might want in order to judge and contact an entrant.
export interface TalentProfileInput {
  firstName: string;
  lastName: string;
  username: string;
  photo?: string;
  bio?: string;
  location?: string;
  skills?: { skills: string; subskills: string[] }[];
  twitter?: string;
  github?: string;
  linkedin?: string;
  telegram?: string;
  website?: string;
  discord?: string;
  walletAddress?: string;
}

export interface SponsorProfile {
  firstName: string;
  lastName: string;
  username: string;
  photo: string | null;
  telegram: string | null;
}

// A question the sponsor requires an answer to before a submission counts.
export interface EligibilityQuestion {
  id: string;
  question: string;
  type: "text" | "link";
  optional: boolean;
}

// The shape the browse feed returns. Enough to render a card, not the full
// listing body.
export interface ListingSummary {
  id: string;
  slug: string;
  title: string;
  type: ListingType;
  status: ListingStatus;
  region: string;
  deadline: string | null;
  reward: RewardAmount | null;
  compensationType: CompensationType;
  isPrivate: boolean;
  isPro: boolean;
  winnersAnnounced: boolean;
  submissionCount: number;
  sponsor: SponsorRef | null;
}

// A listing as its own sponsor sees it, which is the only view that includes
// unpublished drafts. `isPublished` is null when the service did not say: a
// listing whose state is unknown is not treated as a draft, since showing live
// work on a drafts screen is worse than leaving it out.
export interface SponsorListing extends ListingSummary {
  isPublished: boolean | null;
}

export interface Listing extends ListingSummary {
  description: string;
  commitmentDate: string | null;
  pocSocials: string | null;
  skills: SkillGroup[];
  rewards: RewardTier[];
  isFndnPaying: boolean;
  agentAccess: AgentAccess;
  eligibility: EligibilityQuestion[];
  isPublished: boolean;
}

export type SubmissionStatus = "pending" | "rejected" | "winner";

export interface Submission {
  id: string;
  listingId: string;
  link: string | null;
  tweet: string | null;
  otherInfo: string | null;
  telegram: string | null;
  status: SubmissionStatus;
  winnerPosition: number | null;
  createdAt: string | null;
  eligibilityAnswers: EligibilityAnswer[];
  // Present on the sponsor-facing feed only. The talent feed never carries
  // another applicant's identity.
  applicant: SubmissionApplicant | null;
}

export interface EligibilityAnswer {
  question: string;
  answer: string;
}

export interface SubmissionApplicant {
  id: string;
  username: string;
  photo: string | null;
  telegram: string | null;
}

export type NotificationType =
  "WINNERS_ANNOUNCED" | "YOU_WON" | "SUBMISSION_REJECTED" | "PAYMENT_SENT";

// An in-app notification. The text is written by the service at send time, so
// it still reads correctly after the listing it refers to has changed or gone.
export interface EarnNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  // Where tapping it should go, when there is somewhere.
  listingSlug: string | null;
  isRead: boolean;
  createdAt: string | null;
}

export interface NotificationFeed {
  items: EarnNotification[];
  unread: number;
}

// One of the caller's own entries, with enough of the listing to render a row
// and link back to it. This is the only view that answers "what have I applied
// for and how did it go" without already knowing the listing.
export interface MySubmission {
  id: string;
  listingId: string;
  link: string | null;
  otherInfo: string | null;
  status: SubmissionStatus;
  winnerPosition: number | null;
  isPaid: boolean;
  createdAt: string | null;
  listing: {
    id: string;
    slug: string;
    title: string;
    type: ListingType;
    deadline: string | null;
    reward: RewardAmount | null;
    winnersAnnounced: boolean;
    sponsor: SponsorRef | null;
  } | null;
}

// What GET /submission/check answers: whether this user already submitted, and
// once winners are out, how their entry did and what is holding up payment.
export interface SubmissionCheck {
  hasSubmitted: boolean;
  submissionId: string | null;
  isWinner: boolean;
  winnerPosition: number | null;
  winnersAnnounced: boolean;
  kycVerified: boolean;
  isPaid: boolean;
}

// ----- Requests -----

export type BrowseContext = "all" | "home" | "region";
export type BrowseTab = "all" | "bounties" | "projects" | "grants";
export type BrowseSort = "Date" | "Prize" | "Submissions";
export type BrowseOrder = "asc" | "desc";

export interface BrowseQuery {
  context: BrowseContext;
  tab: BrowseTab;
  category: string;
  status: ListingStatus;
  sortBy: BrowseSort;
  order: BrowseOrder;
}

export const DEFAULT_BROWSE_QUERY: BrowseQuery = {
  context: "all",
  tab: "all",
  category: "All",
  status: "open",
  sortBy: "Date",
  order: "asc",
};

export interface CreateSponsorInput {
  name: string;
  slug: string;
  bio: string;
  logo: string;
  industry: string;
  url: string;
  twitter: string;
  entityName: string;
}

export interface SponsorProfileInput {
  firstName: string;
  lastName: string;
  username: string;
  photo: string;
  telegram: string;
}

// A named piece of work. A repo, a deployed demo and a design file are three
// things a reviewer opens separately, which one URL could not express.
export interface Deliverable {
  label: string;
  url: string;
}

// Uploaded evidence for work that cannot be linked to. URLs come from the
// image upload, so nothing arbitrary is stored.
export interface Attachment {
  url: string;
  caption?: string;
}

export interface CreateSubmissionInput {
  listingId: string;
  link: string;
  otherInfo: string;
  telegram: string;
  eligibilityAnswers: EligibilityAnswer[];
  // Where a reward would be paid. Sent so a winner is payable without having
  // opened the profile form; the service ignores it once an address is on file.
  walletAddress?: string;
  deliverables?: Deliverable[];
  attachments?: Attachment[];
  // What the applicant is asking for, on a listing priced as a range rather
  // than a fixed amount. The service requires it for those and rejects it as
  // meaningless on the rest.
  ask?: number;
  // Only sent when the user has a verified X handle linked. The service
  // rejects the field otherwise.
  tweet?: string;
}

export interface WinnerSelection {
  id: string;
  isWinner: boolean;
  winnerPosition: number | null;
}
