// Inline spinner for a button that is waiting on a transaction. Sized and
// coloured from the button's own text, so it works on the light amber CTAs and
// the dark outline ones without a variant per surface.
export function ButtonSpinner() {
  return (
    <span
      aria-hidden
      className="mr-2 inline-block h-[13px] w-[13px] shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current align-[-2px]"
    />
  );
}
