"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Route-level error boundary. Without one, any render crash anywhere in a page
// fell through to Next's built-in "This page couldn't load" screen — which is
// what a single memecoin row with no riskLevel did to the whole dashboard.
//
// Deliberately dependency-free: no translations, no data hooks, no context. An
// error boundary that can itself throw is worse than none, and this renders
// while the app around it is already known to be broken.
//
// The heading is written from the reader's side rather than the system's. A
// dropped connection is far and away the most common way anyone lands here,
// and "something broke" reads as the app confessing a fault on a screen where
// the usual cause is the network. The body still makes no promises about which
// it was, and the retry is the same either way.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report it. Until now this boundary showed the reader a friendly screen and
  // told nobody, so a render crash in production was only ever discovered by
  // someone hitting it and saying so.
  //
  // The try/catch is not defensive padding: the comment above is a promise
  // that this component cannot throw, and importing anything at all is what
  // would break that promise. Reporting failing must not turn a handled error
  // into an unhandled one.
  useEffect(() => {
    try {
      Sentry.captureException(error);
    } catch {
      // Nothing useful to do here, and nowhere safe to say it.
    }
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-[46ch] text-center">
        <div className="ws-display text-[20px]">Seems you&rsquo;re offline</div>
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
            href="/portfolio"
            className="cursor-pointer rounded-full border border-white/15 px-4 py-2 font-sans text-[12.5px] font-semibold text-white transition-colors hover:border-white/35"
          >
            Go to portfolio
          </a>
        </div>
        {error.digest ? (
          <p className="mt-4 font-mono text-[11px] text-white/25">Ref {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
