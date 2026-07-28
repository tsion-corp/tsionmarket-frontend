"use client";

import { useState } from "react";

export interface PageInfo {
  // Clamped 0-based page index — never past the last page.
  page: number;
  pageCount: number;
  // Slice start index into the source array.
  start: number;
  // 1-based bounds of the visible slice (both 0 when the list is empty).
  from: number;
  to: number;
}

// Pure pagination maths, split out from the hook so it can be tested without a
// renderer. Clamps the page into range, which matters for live feeds whose
// length shrinks under a viewer parked on a later page.
export function computePage(total: number, page: number, pageSize: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(0, page), pageCount - 1);
  const start = clamped * pageSize;
  return {
    page: clamped,
    pageCount,
    start,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  };
}

export interface Paged<T> extends PageInfo {
  total: number;
  pageItems: T[];
  canPrev: boolean;
  canNext: boolean;
  goPrev: () => void;
  goNext: () => void;
}

// Client-side pagination for an in-memory list. The view always renders the
// clamped page, and the prev/next handlers step relative to that clamped value,
// so a list that shrinks under the current page self-heals without a stray
// state write during render.
export function usePaged<T>(items: T[], pageSize = 10): Paged<T> {
  const [page, setPage] = useState(0);
  const info = computePage(items.length, page, pageSize);
  const pageItems = items.slice(info.start, info.start + pageSize);
  return {
    ...info,
    total: items.length,
    pageItems,
    canPrev: info.page > 0,
    canNext: info.page < info.pageCount - 1,
    goPrev: () => setPage(Math.max(0, info.page - 1)),
    goNext: () => setPage(Math.min(info.pageCount - 1, info.page + 1)),
  };
}
