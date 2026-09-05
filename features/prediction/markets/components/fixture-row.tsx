"use client";

import { useState } from "react";
import Link from "next/link";
import type { BoardSelection, FixtureBoardRow } from "../presenter";
import { GoalsLineSelect } from "./goals-line-select";
import { OddsButton } from "./odds-button";
import { ProviderArtwork } from "./provider-artwork";

interface FixtureRowProps {
  fixture: FixtureBoardRow;
  selectedIds: ReadonlySet<string>;
  onSelect: (selection: BoardSelection) => void;
  onRemoveSelection: (selectionId: string) => void;
  detailHref: string;
}

function kickoffLabel(startTime: string | null, live: boolean): string {
  if (live) return "LIVE";
  if (!startTime) return "TBD";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startTime));
}

export function FixtureRow({
  fixture,
  selectedIds,
  onSelect,
  onRemoveSelection,
  detailHref,
}: FixtureRowProps) {
  const [selectedTotalId, setSelectedTotalId] = useState(fixture.defaultTotalId);
  const threeWaySelections = [fixture.home, fixture.draw, fixture.away];
  const selectedTotal =
    fixture.totalOptions.find((option) => option.id === selectedTotalId) ??
    fixture.totalOptions.find((option) => option.id === fixture.defaultTotalId) ??
    fixture.totalOptions[0] ??
    null;
  const totalsSelections = [selectedTotal?.over ?? null, selectedTotal?.under ?? null];

  function changeTotalLine(marketId: string) {
    for (const selection of totalsSelections) {
      if (selection && selectedIds.has(selection.id)) onRemoveSelection(selection.id);
    }
    setSelectedTotalId(marketId);
  }

  return (
    <>
      <div className="border-t border-white/[0.075] px-2.5 py-2 lg:hidden">
        <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[9px] font-semibold text-white/36">
          <span
            className={`shrink-0 font-extrabold tracking-[0.03em] tabular-nums ${
              fixture.live ? "text-red-400" : "text-white/62"
            }`}
          >
            {kickoffLabel(fixture.startTime, fixture.live)}
          </span>
          <span aria-hidden="true" className="text-white/18">
            ·
          </span>
          <span className="min-w-0 truncate">{fixture.title}</span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(48px,56px))] items-center gap-1">
          <Link
            href={detailHref}
            aria-label={`View all markets for ${fixture.title}`}
            className="group min-w-0 pr-1"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <ProviderArtwork
                src={fixture.homeLogoUrl}
                alt={`${fixture.homeName} logo`}
                initials={fixture.homeName}
                color={fixture.homeColor}
              />
              <span className="truncate text-[11px] leading-5 font-semibold text-white/88 group-hover:text-white">
                {fixture.homeName}
              </span>
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <ProviderArtwork
                src={fixture.awayLogoUrl}
                alt={`${fixture.awayName} logo`}
                initials={fixture.awayName}
                color={fixture.awayColor}
              />
              <span className="truncate text-[11px] leading-5 font-semibold text-white/88 group-hover:text-white">
                {fixture.awayName}
              </span>
            </span>
          </Link>

          {threeWaySelections.map((selection, index) => (
            <OddsButton
              key={selection?.id ?? `${fixture.id}-mobile-three-way-empty-${index}`}
              selection={selection}
              selected={selection ? selectedIds.has(selection.id) : false}
              onSelect={onSelect}
              compact
            />
          ))}
        </div>

        <Link
          href={detailHref}
          className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold text-white/38 transition-colors hover:text-white/70"
        >
          {fixture.additionalSelections > 0
            ? `+${fixture.additionalSelections} more markets`
            : "View market"}
          <span aria-hidden="true">›</span>
        </Link>
      </div>

      <div className="hidden min-w-[850px] grid-cols-[minmax(260px,1fr)_repeat(3,82px)_58px_repeat(2,82px)_52px] items-center gap-1.5 border-t border-white/[0.065] px-3 py-2.5 lg:grid">
        <Link
          href={detailHref}
          aria-label={`View all markets for ${fixture.title}`}
          className="group -my-1.5 grid min-h-[58px] grid-cols-[54px_minmax(0,1fr)] items-center gap-3 rounded-[8px] py-1.5 pr-3 transition-colors hover:bg-white/[0.045] focus-visible:bg-white/[0.045] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/30"
        >
          <span
            className={`text-[11px] font-bold tabular-nums ${
              fixture.live ? "text-red-400" : "text-white/42"
            }`}
          >
            {kickoffLabel(fixture.startTime, fixture.live)}
          </span>
          <div className="min-w-0 space-y-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <ProviderArtwork
                src={fixture.homeLogoUrl}
                alt={`${fixture.homeName} logo`}
                initials={fixture.homeName}
                color={fixture.homeColor}
              />
              <span className="truncate text-[13px] font-semibold text-white/88 transition-colors group-hover:text-white">
                {fixture.homeName}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <ProviderArtwork
                src={fixture.awayLogoUrl}
                alt={`${fixture.awayName} logo`}
                initials={fixture.awayName}
                color={fixture.awayColor}
              />
              <span className="truncate text-[13px] font-semibold text-white/88 transition-colors group-hover:text-white">
                {fixture.awayName}
              </span>
            </div>
          </div>
        </Link>

        {threeWaySelections.map((selection, index) => (
          <OddsButton
            key={selection?.id ?? `${fixture.id}-three-way-empty-${index}`}
            selection={selection}
            selected={selection ? selectedIds.has(selection.id) : false}
            onSelect={onSelect}
          />
        ))}

        <GoalsLineSelect
          fixtureName={fixture.title}
          options={fixture.totalOptions}
          value={selectedTotal?.id ?? null}
          onChange={changeTotalLine}
        />

        {totalsSelections.map((selection, index) => (
          <OddsButton
            key={selection?.id ?? `${fixture.id}-totals-empty-${index}`}
            selection={selection}
            selected={selection ? selectedIds.has(selection.id) : false}
            onSelect={onSelect}
          />
        ))}

        <Link
          href={detailHref}
          aria-label={`View all markets for ${fixture.title}`}
          className="text-center text-[11px] font-bold text-white/45 transition-colors hover:text-white"
        >
          {fixture.additionalSelections > 0 ? `+${fixture.additionalSelections}` : "View"}
        </Link>
      </div>
    </>
  );
}
