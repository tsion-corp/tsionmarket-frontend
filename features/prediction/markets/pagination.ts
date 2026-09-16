export function nextEventCursor(
  lastPage: { nextCursor: string | null },
  requestedCursors: readonly (string | null)[]
): string | undefined {
  const candidate = lastPage.nextCursor?.trim();
  if (!candidate) return undefined;
  return requestedCursors.includes(candidate) ? undefined : candidate;
}
