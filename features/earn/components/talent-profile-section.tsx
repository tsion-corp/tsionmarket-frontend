"use client";

import { useRouter } from "next/navigation";
import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { TalentProfileForm } from "@/features/earn/components/talent-profile-form";
import { useTalentProfile } from "@/features/earn/hooks/use-earn-talent";

const PAGE = "mx-auto w-full max-w-[720px] px-4 pt-6 pb-20 sm:px-6";

// Your profile as an entrant, editable on its own rather than only on the way
// into a listing. Completing it is what lets you enter one at all.
export function TalentProfileSection() {
  const router = useRouter();
  const { profile, needsProfile, isLoading, error } = useTalentProfile();

  if (error) {
    return (
      <div className={PAGE}>
        <AsyncError
          error={error}
          subject="your profile"
          unconfiguredDetail="This goes live once the earn service is switched on."
        />
      </div>
    );
  }

  if (isLoading || needsProfile === undefined) {
    return (
      <div className={PAGE}>
        <AsyncLoading label="Loading your profile" rows={4} />
      </div>
    );
  }

  return (
    <div className={PAGE}>
      <h1 className="ws-display text-[clamp(22px,3vw,30px)] tracking-[-0.02em] text-white">
        Your profile
      </h1>
      <p className="mt-1.5 font-sans text-[13px] font-normal text-white/50">
        {needsProfile
          ? "Fill this in once and you can enter any listing."
          : "What sponsors see when they review your work."}
      </p>

      <div className="mt-7">
        <TalentProfileForm existing={profile} onDone={() => router.push("/earn")} />
      </div>
    </div>
  );
}
