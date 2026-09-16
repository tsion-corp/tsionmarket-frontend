"use client";

import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { SquareOutboundLink } from "@/features/square/components/square-outbound-link";

/**
 * One section of the Square page, the Square's own section heading carried
 * over (market-square-frontend/components/layout/section-heading.tsx): a
 * 24px Manrope heading with its last word on the lilac-to-purple ramp, an
 * optional line under it, and the "View more" pill at the row's right, which
 * opens the matching page in the Square. The rail sits 16px under the row
 * and sections stand 64px apart, Home's own rhythm.
 *
 * Three states, decided here so the sections cannot disagree:
 *   · loading: the heading with a skeleton, so the page has its shape at once;
 *   · failed: the heading with the shared error state, never a silent gap;
 *   · empty: NOTHING, not even the heading. Home follows the same rule, and a
 *     shelf advertising nothing argues against the page.
 */
export function SquareHomeSection({
  id,
  lead,
  accent,
  subtitle,
  viewMore,
  loading,
  loadingLabel,
  error,
  errorSubject,
  unconfiguredDetail,
  onRetry,
  empty,
  children,
}: {
  id: string;
  /** The heading's first words, white. */
  lead: string;
  /** The heading's last word, on the purple ramp. Some headings are all white. */
  accent?: string;
  subtitle?: string;
  /** The "View more" pill: where in the Square this section continues. */
  viewMore: { label: string; href: string | null };
  loading: boolean;
  loadingLabel: string;
  error: unknown;
  errorSubject: string;
  unconfiguredDetail: string;
  onRetry: () => void;
  /** True once the read has answered and there is nothing to show. */
  empty: boolean;
  children: React.ReactNode;
}) {
  const failed = error !== null && error !== undefined;
  if (!loading && !failed && empty) return null;

  return (
    <section aria-labelledby={id} className="mb-[64px] last:mb-0">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id={id}
            className="font-[family-name:var(--font-heading)] text-[24px] leading-[28.61px] font-bold text-white"
          >
            {lead}
            {accent ? (
              <>
                {" "}
                <span className="bg-[linear-gradient(90deg,#C196FD_0%,#7E3BEB_100%)] bg-clip-text text-transparent">
                  {accent}
                </span>
              </>
            ) : null}
          </h2>
          {subtitle ? (
            <p className="pt-0.5 font-[family-name:var(--font-roboto)] text-[10px] leading-[10.16px] font-bold text-white/40">
              {subtitle}
            </p>
          ) : null}
        </div>
        <SquareOutboundLink href={viewMore.href} label={viewMore.label} variant="viewMore" />
      </div>

      {loading ? <AsyncLoading label={loadingLabel} rows={2} /> : null}
      {failed ? (
        <AsyncError
          error={error}
          subject={errorSubject}
          unconfiguredDetail={unconfiguredDetail}
          onRetry={onRetry}
        />
      ) : null}
      {!loading && !failed ? children : null}
    </section>
  );
}

/**
 * The sideways rail every section lays its cards on, as Home does: a flex
 * row that scrolls without a scrollbar, each card holding its own width. The
 * gap is the caller's, because Home's rails each measure a different one.
 */
export function SquareHomeRail({
  gap,
  align = "start",
  children,
}: {
  gap: number;
  /** Home's post rail sits its cards on their feet; the rest on their heads. */
  align?: "start" | "end";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex snap-x [scrollbar-width:none] overflow-x-auto pb-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${
        align === "end" ? "items-end" : "items-start"
      }`}
      style={{ gap }}
    >
      {children}
    </div>
  );
}

/** The Square's card glass: 62% ink behind a 7px blur, ringed at white/18. */
export const SQUARE_GLASS =
  "bg-[rgba(16,16,18,0.62)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] backdrop-blur-[7px]";
