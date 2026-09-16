"use client";

import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { groupRoomCode, looksLikeRoomCode } from "@/lib/square/room-code";
import { useSquareSearch } from "@/features/square/hooks/use-square-home";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import { SquarePersonRow } from "@/features/square/components/square-person-row";

/**
 * Home's search results, the Square's own carried over
 * (market-square-frontend/components/layout/home-search.tsx): a way into a
 * room when the words are a room code, then the people, the gist rooms, the
 * posts and the ARK Store hits the Square found, each under its heading,
 * with "Show more results" at the foot. Everything is read from the Square's
 * one search route through this app's relay; following acts here, and every
 * other row opens the thing it names in the Square.
 */
export function SquareHomeSearch({ query, meId }: { query: string; meId?: string }) {
  const t = useTranslations("square");
  const trimmed = query.trim();
  const bareCode = trimmed.toLowerCase().replace(/[\s-]/g, "");
  const code = looksLikeRoomCode(trimmed) ? bareCode : null;
  const codeHref = code ? squareLinks.roomCode(code) : null;

  const search = useSquareSearch(trimmed);
  const items = search.data?.pages.flatMap((page) => page.items) ?? [];
  const people = items.flatMap((item) => (item.kind === "profile" ? [item] : []));
  const rooms = items.flatMap((item) => (item.kind === "stream" ? [item] : []));
  const posts = items.flatMap((item) => (item.kind === "post" ? [item] : []));
  const products = items.flatMap((item) => (item.kind === "product" ? [item] : []));

  return (
    <div className="flex flex-col gap-6 pb-16" aria-live="polite">
      {codeHref ? (
        <a
          href={codeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ws-card ws-pressable flex items-center gap-3 p-4"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(90deg,#9F65FD_0%,#5B05E6_100%)] text-[15px] font-bold text-white">
            #
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-white">{t("openRoomCode")}</span>
            <span className="tnum block text-[13px] tracking-[0.08em] text-[#71717a]">
              {groupRoomCode(bareCode)}
            </span>
          </span>
        </a>
      ) : null}

      {search.isPending ? (
        <div className="flex flex-col gap-2" role="status">
          <span className="sr-only">{t("loading")}</span>
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-3 px-4 py-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/6" />
              <div className="flex-1 space-y-2.5 py-1">
                <div className="h-3 w-40 animate-pulse rounded bg-white/6" />
                <div className="h-3 w-full animate-pulse rounded bg-white/6" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {search.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-[16.5px] border border-white/10 px-6 py-10 text-center">
          <p className="text-sm text-[#f6a5a5]">{t("searchFailed")}</p>
          <button
            type="button"
            onClick={() => void search.refetch()}
            className="ws-pressable rounded-full border border-white/15 px-4 py-2 text-[12.5px] font-semibold text-white"
          >
            {t("tryAgain")}
          </button>
        </div>
      ) : null}

      {!search.isPending && !search.isError && items.length === 0 && !code ? (
        <div className="flex flex-col items-center gap-2 rounded-[16.5px] border border-white/10 px-6 py-12 text-center">
          <p className="ws-display text-[15px] text-[#f4f4f4]">{t("searchNothing")}</p>
          <p className="max-w-sm text-[13px] leading-5 text-[#7a7a7a]">
            {t("searchNothingBody", { query: trimmed })}
          </p>
        </div>
      ) : null}

      {people.length > 0 ? (
        <Section title={t("sectionPeople")}>
          {people.map((item) => (
            <SquarePersonRow key={item.id} profile={item.profile} meId={meId} />
          ))}
        </Section>
      ) : null}

      {rooms.length > 0 ? (
        <Section title={t("sectionRooms")}>
          {rooms.map((item) => (
            <ResultLink key={item.id} href={squareLinks.live(item.stream.id)}>
              <SquareAvatar
                src={item.stream.thumbnailUrl ?? null}
                seed={item.stream.id}
                name={item.stream.title}
                size={38}
                shape="squircle"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-white">
                  {item.stream.title}
                </span>
                {item.stream.owner ? (
                  <span className="block truncate text-[13px] text-[#71717a]">
                    {item.stream.owner.displayName || item.stream.owner.username}
                  </span>
                ) : null}
              </span>
            </ResultLink>
          ))}
        </Section>
      ) : null}

      {posts.length > 0 ? (
        <Section title={t("sectionPosts")}>
          {posts.map((item) => (
            <ResultLink key={item.id} href={squareLinks.post(item.post.id)} block>
              <span className="block text-[13px] text-[#71717a]">
                {item.post.author ? `@${item.post.author.username}` : t("aPost")}
              </span>
              <span className="mt-1 line-clamp-2 block text-[15px] text-white">
                {item.post.text || t("postNoWords")}
              </span>
            </ResultLink>
          ))}
        </Section>
      ) : null}

      {products.length > 0 ? (
        <Section title={t("sectionStore")}>
          {products.map((item) => (
            <ResultLink key={item.id} href={squareLinks.product(item.product.slug)}>
              <SquareAvatar
                src={item.product.thumbnailUrl ?? null}
                seed={item.product.id}
                name={item.product.name}
                size={38}
                shape="squircle"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-white">
                  {item.product.name}
                </span>
                {item.product.tagline ? (
                  <span className="block truncate text-[13px] text-[#71717a]">
                    {item.product.tagline}
                  </span>
                ) : null}
              </span>
            </ResultLink>
          ))}
        </Section>
      ) : null}

      {search.hasNextPage ? (
        <button
          type="button"
          onClick={() => void search.fetchNextPage()}
          disabled={search.isFetchingNextPage}
          className="ws-pressable mx-auto rounded-full border border-white/15 px-4 py-2 text-[13px] text-[#71717a] disabled:opacity-50"
        >
          {search.isFetchingNextPage ? t("loadingMore") : t("showMoreResults")}
        </button>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-[#71717a] uppercase">
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

/** A result row that opens what it names in the Square. */
function ResultLink({
  href,
  block = false,
  children,
}: {
  href: string | null;
  block?: boolean;
  children: React.ReactNode;
}) {
  const className = block
    ? "ws-pressable block px-1 py-3"
    : "ws-pressable flex items-center gap-3 px-1 py-3";
  if (!href) return <div className={className}>{children}</div>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
