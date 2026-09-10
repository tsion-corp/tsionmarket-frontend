"use client";

// Route-level error boundary. Without one, any render crash anywhere in a page
// fell through to Next's built-in "This page couldn't load" screen — which is
// what a single memecoin row with no riskLevel did to the whole dashboard.
//
// Deliberately dependency-free: no translations, no data hooks, no context. An
// error boundary that can itself throw is worse than none, and this renders
// while the app around it is already known to be broken.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-[46ch] text-center">
        <div className="ws-display text-[20px]">Something on this page broke</div>
        <p className="mt-2 text-[13.5px] font-normal text-white/55">
          The rest of the app is fine, and your funds are untouched. Try again, or move to another
          section.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2.5">
          <button
            onClick={reset}
            className="cursor-pointer rounded-full bg-white px-4 py-2 font-sans text-[12.5px] font-semibold text-black"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="cursor-pointer rounded-full border border-white/15 px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
          >
            Go to dashboard
          </a>
        </div>
        {error.digest ? (
          <p className="mt-4 font-mono text-[11px] text-white/25">Ref {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
