import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowseSection } from "@/components/dashboard/earn/browse-section";
import { ListingDetailSection } from "@/components/dashboard/earn/listing-detail-section";
import { SubmitSheet } from "@/components/dashboard/earn/submit-sheet";
import { SponsorDraftsSection } from "@/components/dashboard/earn/sponsor/sponsor-drafts-section";
import { SponsorOnboardingSection } from "@/components/dashboard/earn/sponsor/sponsor-onboarding-section";
import { SubmissionReviewList } from "@/components/dashboard/earn/sponsor/submission-review-list";
import { parseRewardInput, rewardFrom } from "@/lib/earn/reward";
import type { Listing, ListingSummary, SponsorListing, Submission } from "@/lib/earn/api/types";

// The screens are mocked at the API-client seam, not inside the components, so
// these exercise the real hooks, real query wiring and real render paths.

const listingsApi = vi.hoisted(() => ({
  fetchListings: vi.fn(),
  fetchListingCount: vi.fn(),
  fetchListingDetail: vi.fn(),
}));
const sponsorsApi = vi.hoisted(() => ({
  fetchCurrentSponsor: vi.fn(),
  checkSponsorName: vi.fn(),
  checkSponsorSlug: vi.fn(),
  createSponsor: vi.fn(),
  saveSponsorProfile: vi.fn(),
}));
const submissionsApi = vi.hoisted(() => ({
  checkSubmission: vi.fn(),
  fetchMySubmission: vi.fn(),
  createSubmission: vi.fn(),
}));
const dashboardApi = vi.hoisted(() => ({
  fetchIsCreateAllowed: vi.fn(),
  fetchSponsorListing: vi.fn(),
  fetchSponsorListings: vi.fn(),
  fetchSponsorSubmissions: vi.fn(),
  saveListingDraft: vi.fn(),
  publishListing: vi.fn(),
  updateListing: vi.fn(),
  rejectSubmissions: vi.fn(),
  toggleWinners: vi.fn(),
}));
const talentApi = vi.hoisted(() => ({
  fetchTalentProfile: vi.fn(),
  completeTalentProfile: vi.fn(),
}));
const imagesApi = vi.hoisted(() => ({
  ACCEPTED_IMAGE_TYPES: ["image/png", "image/jpeg", "image/webp"] as const,
  MAX_IMAGE_BYTES: 5 * 1024 * 1024,
  imageRejectionReason: vi.fn(() => null),
  signImageUpload: vi.fn(),
  putSignedUpload: vi.fn(),
  completeImageUpload: vi.fn(),
}));

vi.mock("@/lib/earn/api/listings", () => listingsApi);
vi.mock("@/lib/earn/api/sponsors", () => sponsorsApi);
vi.mock("@/lib/earn/api/submissions", () => submissionsApi);
vi.mock("@/lib/earn/api/sponsor-dashboard", () => dashboardApi);
vi.mock("@/lib/earn/api/images", () => imagesApi);
vi.mock("@/lib/earn/api/talent", () => talentApi);

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/earn",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function usdc(amount: string) {
  return rewardFrom(parseRewardInput(amount, "USDC"), "USDC");
}

function summary(over: Partial<ListingSummary> = {}): ListingSummary {
  return {
    id: "listing_1",
    slug: "test-listing",
    title: "Build a trading dashboard",
    type: "bounty",
    status: "open",
    region: "Global",
    deadline: "2099-12-31T23:59:59.000Z",
    reward: usdc("1000"),
    compensationType: "fixed",
    isPrivate: false,
    isPro: false,
    winnersAnnounced: false,
    submissionCount: 3,
    sponsor: { id: "sponsor_1", name: "Test Sponsor", slug: "test-sponsor", logo: null },
    ...over,
  };
}

function detail(over: Partial<Listing> = {}): Listing {
  return {
    ...summary(),
    description: "Build something useful",
    commitmentDate: "2100-01-02T23:59:59.000Z",
    pocSocials: "https://t.me/testowner",
    skills: [{ skill: "Frontend", subskills: ["React"] }],
    rewards: [{ position: 1, amount: usdc("1000") }],
    isFndnPaying: false,
    agentAccess: "HUMAN_ONLY",
    eligibility: [],
    isPublished: true,
    ...over,
  };
}

function entry(over: Partial<Submission> = {}): Submission {
  return {
    id: "submission_1",
    listingId: "listing_1",
    link: "https://github.com/example/submission",
    tweet: null,
    otherInfo: null,
    telegram: null,
    status: "pending",
    winnerPosition: null,
    createdAt: "2026-07-30T10:00:00.000Z",
    eligibilityAnswers: [],
    applicant: { id: "user_1", username: "testsubmitter", photo: null, telegram: null },
    ...over,
  };
}

const apiFailure = () => Object.assign(new Error("boom"), { code: "UPSTREAM_ERROR", status: 502 });

beforeEach(() => {
  vi.clearAllMocks();
  // Each test opts into its own data.
  listingsApi.fetchListings.mockResolvedValue([]);
  listingsApi.fetchListingCount.mockResolvedValue(0);
  listingsApi.fetchListingDetail.mockResolvedValue(detail());
  sponsorsApi.fetchCurrentSponsor.mockResolvedValue(null);
  sponsorsApi.checkSponsorName.mockResolvedValue(true);
  sponsorsApi.checkSponsorSlug.mockResolvedValue(true);
  sponsorsApi.createSponsor.mockResolvedValue(null);
  submissionsApi.checkSubmission.mockResolvedValue({
    hasSubmitted: false,
    submissionId: null,
    isWinner: false,
    winnerPosition: null,
    winnersAnnounced: false,
    kycVerified: false,
    isPaid: false,
  });
  // A complete profile by default, so a test about entering a listing is not
  // silently testing the profile form instead.
  talentApi.fetchTalentProfile.mockResolvedValue({
    id: "user_1",
    firstName: "Test",
    lastName: "Submitter",
    username: "testsubmitter",
    photo: null,
    bio: null,
    location: null,
    skills: [],
    twitter: null,
    github: null,
    linkedin: null,
    telegram: "https://t.me/testsubmitter",
    website: null,
    discord: null,
    walletAddress: null,
    isTalentFilled: true,
  });
  talentApi.completeTalentProfile.mockResolvedValue(null);
  dashboardApi.fetchSponsorListings.mockResolvedValue([]);
  dashboardApi.fetchSponsorSubmissions.mockResolvedValue([]);
  dashboardApi.rejectSubmissions.mockResolvedValue(undefined);
  dashboardApi.toggleWinners.mockResolvedValue(undefined);
});

describe("browse feed", () => {
  // An empty feed at its widest has nothing to filter down to, so it offers the
  // only thing that would fill it rather than blaming the filters.
  it("invites a first listing when nothing is open at all", async () => {
    render(<BrowseSection />, { wrapper });

    expect(await screen.findByText(/no work is open right now/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /post the first one/i })).toHaveAttribute(
      "href",
      "/earn/sponsor"
    );
  });

  it("blames the filters, and clears them, when the feed is narrowed", async () => {
    render(<BrowseSection />, { wrapper });
    await screen.findByText(/no work is open right now/i);

    fireEvent.click(screen.getByRole("button", { name: "Bounties" }));

    expect(await screen.findByText(/nothing open under these filters/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show everything/i }));

    await waitFor(() =>
      expect(listingsApi.fetchListings).toHaveBeenLastCalledWith(
        expect.objectContaining({ tab: "all", status: "open" })
      )
    );
    expect(await screen.findByText(/no work is open right now/i)).toBeInTheDocument();
  });

  it("lists what came back, with its reward", async () => {
    listingsApi.fetchListings.mockResolvedValue([summary()]);
    listingsApi.fetchListingCount.mockResolvedValue(1);

    render(<BrowseSection />, { wrapper });

    expect(await screen.findByText("Build a trading dashboard")).toBeInTheDocument();
    expect(screen.getByText("1,000 USDC")).toBeInTheDocument();
    expect(screen.getByText("Test Sponsor")).toBeInTheDocument();
  });

  it("shows the failure rather than an empty page when the feed errors", async () => {
    listingsApi.fetchListings.mockRejectedValue(apiFailure());

    render(<BrowseSection />, { wrapper });

    expect(await screen.findByText(/couldn't load listings/i)).toBeInTheDocument();
    expect(screen.queryByText(/no work is open right now/i)).not.toBeInTheDocument();
  });

  it("reads as not-available-yet when the service is not configured", async () => {
    listingsApi.fetchListings.mockRejectedValue(
      Object.assign(new Error("nope"), { code: "NOT_CONFIGURED", status: 503 })
    );

    render(<BrowseSection />, { wrapper });

    expect(await screen.findByText(/listings isn't available yet/i)).toBeInTheDocument();
    // A service that is off is not something the user can retry away.
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("refetches against the chosen filter", async () => {
    render(<BrowseSection />, { wrapper });
    await screen.findByText(/no work is open right now/i);

    fireEvent.click(screen.getByRole("button", { name: "Bounties" }));

    await waitFor(() =>
      expect(listingsApi.fetchListings).toHaveBeenCalledWith(
        expect.objectContaining({ tab: "bounties" })
      )
    );
  });
});

describe("entering a listing", () => {
  const listing = {
    listingId: "listing_1",
    listingTitle: "Build a trading dashboard",
    eligibility: [],
  };

  // The service refuses a submission from an account whose talent profile is
  // not filled in. Asking first means nobody writes out an entry and loses it
  // to a rejection they had no warning about.
  it("asks for the profile first when it has not been filled in", async () => {
    talentApi.fetchTalentProfile.mockResolvedValue(null);

    render(<SubmitSheet open onClose={() => {}} {...listing} />, {
      wrapper,
    });

    expect(await screen.findByText(/first, your profile/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/link to your work/i)).not.toBeInTheDocument();
  });

  it("goes straight to the entry form when the profile is complete", async () => {
    render(<SubmitSheet open onClose={() => {}} {...listing} />, {
      wrapper,
    });

    expect(await screen.findByLabelText(/link to your work/i)).toBeInTheDocument();
    expect(screen.queryByText(/first, your profile/i)).not.toBeInTheDocument();
  });

  it("completes the profile, then shows the entry form without losing the listing", async () => {
    talentApi.fetchTalentProfile.mockResolvedValue(null);

    render(<SubmitSheet open onClose={() => {}} {...listing} />, {
      wrapper,
    });

    await screen.findByText(/first, your profile/i);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Lovelace" } });
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "ada" } });

    // The profile now exists, which is what the refetch after saving returns.
    talentApi.fetchTalentProfile.mockResolvedValue({
      id: "user_1",
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      photo: null,
      bio: null,
      location: null,
      skills: [],
      twitter: null,
      github: null,
      linkedin: null,
      telegram: null,
      website: null,
      discord: null,
      walletAddress: null,
      isTalentFilled: true,
    });

    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() =>
      expect(talentApi.completeTalentProfile).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: "Ada", lastName: "Lovelace", username: "ada" })
      )
    );
    expect(await screen.findByLabelText(/link to your work/i)).toBeInTheDocument();
  });

  it("will not save a profile with no username", async () => {
    talentApi.fetchTalentProfile.mockResolvedValue(null);

    render(<SubmitSheet open onClose={() => {}} {...listing} />, {
      wrapper,
    });

    await screen.findByText(/first, your profile/i);
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    expect(await screen.findByText(/pick a username/i)).toBeInTheDocument();
    expect(talentApi.completeTalentProfile).not.toHaveBeenCalled();
  });

  it("sends the entry with the telegram already on the profile", async () => {
    submissionsApi.createSubmission.mockResolvedValue(null);

    render(<SubmitSheet open onClose={() => {}} {...listing} />, {
      wrapper,
    });

    fireEvent.change(await screen.findByLabelText(/link to your work/i), {
      target: { value: "https://github.com/ada/entry" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(submissionsApi.createSubmission).toHaveBeenCalledWith(
        expect.objectContaining({
          listingId: "listing_1",
          link: "https://github.com/ada/entry",
          telegram: "https://t.me/testsubmitter",
        })
      )
    );
  });
});

describe("sponsor drafts", () => {
  const sponsor = {
    id: "sponsor_1",
    name: "Test Sponsor",
    slug: "test-sponsor",
    logo: null,
    bio: "",
    industry: "DeFi",
    url: null,
    twitter: null,
    entityName: null,
  };

  function owned(over: Partial<SponsorListing> = {}): SponsorListing {
    return { ...summary(), isPublished: false, ...over };
  }

  beforeEach(() => {
    sponsorsApi.fetchCurrentSponsor.mockResolvedValue(sponsor);
  });

  it("lists the drafts and links each one into the editor", async () => {
    dashboardApi.fetchSponsorListings.mockResolvedValue([
      owned({ id: "d1", slug: "draft-one", title: "Index Base transfers" }),
      owned({ id: "p1", slug: "live-one", title: "Already published", isPublished: true }),
    ]);

    render(<SponsorDraftsSection />, { wrapper });

    const link = await screen.findByRole("link", { name: /index base transfers/i });
    expect(link).toHaveAttribute("href", "/earn/sponsor/listing/draft-one?type=bounty");
    expect(screen.queryByText("Already published")).not.toBeInTheDocument();
  });

  // A missing isPublished means the service did not say. Showing a live listing
  // on the drafts screen invites a second publish, so unknown is left out.
  it("leaves out a listing whose published state the service did not report", async () => {
    dashboardApi.fetchSponsorListings.mockResolvedValue([
      owned({ id: "u1", title: "State unknown", isPublished: null }),
    ]);

    render(<SponsorDraftsSection />, { wrapper });

    expect(await screen.findByText(/no drafts right now/i)).toBeInTheDocument();
    expect(screen.queryByText("State unknown")).not.toBeInTheDocument();
  });

  it("says what is still missing on a draft that has no deadline or reward", async () => {
    dashboardApi.fetchSponsorListings.mockResolvedValue([
      owned({ id: "d2", slug: "bare", title: "Barely started", deadline: null, reward: null }),
    ]);

    render(<SponsorDraftsSection />, { wrapper });

    expect(await screen.findByText(/no deadline yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no reward set/i)).toBeInTheDocument();
  });

  it("shows the failure rather than an empty list when the feed errors", async () => {
    dashboardApi.fetchSponsorListings.mockRejectedValue(apiFailure());

    render(<SponsorDraftsSection />, { wrapper });

    expect(await screen.findByText(/couldn't load your drafts/i)).toBeInTheDocument();
    expect(screen.queryByText(/no drafts right now/i)).not.toBeInTheDocument();
  });

  it("sends someone without a company to set one up", async () => {
    sponsorsApi.fetchCurrentSponsor.mockResolvedValue(null);

    render(<SponsorDraftsSection />, { wrapper });

    expect(await screen.findByText(/drafts belong to a company/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /set up your company/i })).toHaveAttribute(
      "href",
      "/earn/sponsor/new"
    );
  });
});

describe("listing detail", () => {
  it("shows the listing and offers to submit", async () => {
    render(<ListingDetailSection slug="test-listing" />, { wrapper });

    expect(
      await screen.findByRole("heading", { name: "Build a trading dashboard" })
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Submit work" })).toBeEnabled();
  });

  it("refuses a second entry once the user has already submitted", async () => {
    submissionsApi.checkSubmission.mockResolvedValue({
      hasSubmitted: true,
      submissionId: "submission_1",
      isWinner: false,
      winnerPosition: null,
      winnersAnnounced: false,
      kycVerified: false,
      isPaid: false,
    });

    render(<ListingDetailSection slug="test-listing" />, { wrapper });

    const button = await screen.findByRole("button", { name: /already submitted/i });
    expect(button).toBeDisabled();
    expect(await screen.findByText(/entry received/i)).toBeInTheDocument();
  });

  it("tells a winner what is holding up their payment", async () => {
    submissionsApi.checkSubmission.mockResolvedValue({
      hasSubmitted: true,
      submissionId: "submission_1",
      isWinner: true,
      winnerPosition: 1,
      winnersAnnounced: true,
      kycVerified: false,
      isPaid: false,
    });

    render(<ListingDetailSection slug="test-listing" />, { wrapper });

    expect(await screen.findByText(/you won 1st place/i)).toBeInTheDocument();
    expect(screen.getByText(/identity verification/i)).toBeInTheDocument();
  });

  it("closes submissions once the deadline has passed", async () => {
    listingsApi.fetchListingDetail.mockResolvedValue(
      detail({ deadline: "2020-01-01T00:00:00.000Z" })
    );

    render(<ListingDetailSection slug="test-listing" />, { wrapper });

    expect(await screen.findByRole("button", { name: "Closed" })).toBeDisabled();
  });

  it("surfaces a failed load", async () => {
    listingsApi.fetchListingDetail.mockRejectedValue(apiFailure());

    render(<ListingDetailSection slug="test-listing" />, { wrapper });

    expect(await screen.findByText(/couldn't load this listing/i)).toBeInTheDocument();
  });
});

describe("sponsor onboarding", () => {
  it("holds the form until the required fields are filled", async () => {
    render(<SponsorOnboardingSection />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Give your company a name.")).toBeInTheDocument();
    expect(sponsorsApi.createSponsor).not.toHaveBeenCalled();
  });

  it("sends nothing until the owner's details are filled in too", async () => {
    // The service takes the company and the owner in one call, so finishing the
    // first step must not create anything on its own.
    sponsorsApi.checkSponsorName.mockResolvedValue(true);
    render(<SponsorOnboardingSection />, { wrapper });

    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText(/what your company does/i), {
      target: { value: "We build things." },
    });
    fireEvent.change(screen.getByLabelText(/industry/i), { target: { value: "DeFi" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // The company step is done, logo and all: a logo is optional, so its
    // absence must not hold the form here. Nothing is created yet either way,
    // since the service takes the company and the owner together.
    expect(await screen.findByText("Your details")).toBeInTheDocument();
    expect(sponsorsApi.createSponsor).not.toHaveBeenCalled();
  });

  it("refuses a company name the service says is taken", async () => {
    sponsorsApi.checkSponsorName.mockResolvedValue(false);

    render(<SponsorOnboardingSection />, { wrapper });
    fireEvent.change(screen.getByLabelText(/company name/i), {
      target: { value: "Taken Co" },
    });

    // The check is debounced, so wait for the answer before submitting.
    await waitFor(() => expect(sponsorsApi.checkSponsorName).toHaveBeenCalledWith("Taken Co"));

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("That name is taken.")).toBeInTheDocument();
    expect(sponsorsApi.createSponsor).not.toHaveBeenCalled();
  });

  it("derives a slug from the name until the slug is edited by hand", () => {
    render(<SponsorOnboardingSection />, { wrapper });

    fireEvent.change(screen.getByLabelText(/company name/i), {
      target: { value: "Test Sponsor" },
    });
    expect(screen.getByLabelText(/page slug/i)).toHaveValue("test-sponsor");

    fireEvent.change(screen.getByLabelText(/page slug/i), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText(/company name/i), {
      target: { value: "Test Sponsor Inc" },
    });

    expect(screen.getByLabelText(/page slug/i)).toHaveValue("custom");
  });
});

describe("submission review", () => {
  it("says so when nobody has entered", async () => {
    render(<SubmissionReviewList slug="test-listing" rewards={[]} />, { wrapper });
    expect(await screen.findByText("No entries yet.")).toBeInTheDocument();
  });

  it("rejects an entry", async () => {
    dashboardApi.fetchSponsorSubmissions.mockResolvedValue([entry()]);

    render(<SubmissionReviewList slug="test-listing" rewards={[]} />, { wrapper });

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(dashboardApi.rejectSubmissions).toHaveBeenCalledWith(["submission_1"])
    );
  });

  it("assigns a winner to a paying position", async () => {
    dashboardApi.fetchSponsorSubmissions.mockResolvedValue([entry()]);

    render(
      <SubmissionReviewList
        slug="test-listing"
        rewards={[{ position: 1, amount: usdc("1000") }]}
      />,
      { wrapper }
    );

    const picker = await screen.findByLabelText(/winner for 1st place/i);
    fireEvent.change(picker, { target: { value: "submission_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save winners" }));

    await waitFor(() =>
      expect(dashboardApi.toggleWinners).toHaveBeenCalledWith([
        { id: "submission_1", isWinner: true, winnerPosition: 1 },
      ])
    );
  });

  it("unsets the previous winner when a position is cleared", async () => {
    dashboardApi.fetchSponsorSubmissions.mockResolvedValue([
      entry({ status: "winner", winnerPosition: 1 }),
    ]);

    render(
      <SubmissionReviewList
        slug="test-listing"
        rewards={[{ position: 1, amount: usdc("1000") }]}
      />,
      { wrapper }
    );

    const picker = await screen.findByLabelText(/winner for 1st place/i);
    fireEvent.change(picker, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save winners" }));

    // Leaving the old winner set would pay somebody the sponsor just removed.
    await waitFor(() =>
      expect(dashboardApi.toggleWinners).toHaveBeenCalledWith([
        { id: "submission_1", isWinner: false, winnerPosition: null },
      ])
    );
  });

  it("keeps the save button inert until something changes", async () => {
    dashboardApi.fetchSponsorSubmissions.mockResolvedValue([entry()]);

    render(
      <SubmissionReviewList
        slug="test-listing"
        rewards={[{ position: 1, amount: usdc("1000") }]}
      />,
      { wrapper }
    );

    expect(await screen.findByRole("button", { name: "Save winners" })).toBeDisabled();
  });

  it("surfaces a failed load", async () => {
    dashboardApi.fetchSponsorSubmissions.mockRejectedValue(apiFailure());

    render(<SubmissionReviewList slug="test-listing" rewards={[]} />, { wrapper });

    expect(await screen.findByText(/couldn't load the entries/i)).toBeInTheDocument();
  });
});
