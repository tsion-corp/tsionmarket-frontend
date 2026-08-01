"use client";

import { useState } from "react";
import Link from "next/link";
import { AsyncEmpty, AsyncError, AsyncLoading } from "@/components/dashboard/async-state";
import { ListingCard } from "@/components/dashboard/earn/listing-card";
import { ListingFilters } from "@/components/dashboard/earn/listing-filters";
import { useListingFeed } from "@/hooks/use-earn-listings";
import { useCurrentSponsor } from "@/hooks/use-earn-sponsor";
import { DEFAULT_BROWSE_QUERY, type BrowseQuery } from "@/lib/earn/api/types";
import { BRAND } from "@/lib/brand";

const PAGE = "mx-auto w-full max-w-[1520px] px-4 pt-8 pb-20 sm:px-6 lg:px-8";

const UNCONFIGURED_DETAIL = "Bounties go live once the earn service is switched on.";

export function BrowseSection() {
  const [query, setQuery] = useState<BrowseQuery>(DEFAULT_BROWSE_QUERY);
  const { listings, count, isLoading, error } = useListingFeed(query);
  const { sponsor } = useCurrentSponsor();

  return (
    <div className={PAGE}>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-44 right-[-120px] -z-10 h-[560px] w-[560px] bg-[radial-gradient(circle,rgba(212,212,216,0.16),transparent_65%)]"
      />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="ws-display mt-2.5 bg-[linear-gradient(180deg,#ffffff,#cfcfd4)] bg-clip-text text-[clamp(30px,4.4vw,44px)] tracking-[-0.02em] text-transparent">
            Earn
          </h1>
          <p className="mt-1.5 max-w-[52ch] font-sans text-[13.5px] font-normal text-white/55">
            Paid work posted by companies building on {BRAND}. Pick something, ship it, get paid.
          </p>
        </div>

        <Link
          href="/earn/sponsor"
          className="ws-inset cursor-pointer rounded-full px-4 py-2.5 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/30"
        >
          {sponsor ? "Your company" : "Post a listing"}
        </Link>
      </header>

      <div className="mt-7">
        <ListingFilters query={query} onChange={setQuery} />
      </div>

      <div className="mt-6">
        {error ? (
          <AsyncError error={error} subject="listings" unconfiguredDetail={UNCONFIGURED_DETAIL} />
        ) : isLoading ? (
          <AsyncLoading label="Loading listings" rows={5} />
        ) : listings.length === 0 ? (
          <AsyncEmpty>Nothing open under these filters right now.</AsyncEmpty>
        ) : (
          <>
            {count !== null ? (
              <div className="tnum mb-3 font-sans text-[12.5px] font-normal text-white/45">
                {count} {count === 1 ? "listing" : "listings"}
              </div>
            ) : null}
            <div className="grid gap-3 min-[1280px]:grid-cols-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing, index) => (
                <ListingCard key={listing.id} listing={listing} featured={index === 0} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
