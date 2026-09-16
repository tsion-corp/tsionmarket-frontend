"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// The boundary of last resort. app/error.tsx catches a crash inside a route,
// but it renders inside the root layout, so it cannot help when the layout
// itself is what threw. This one replaces the whole document, which is why it
// has to supply its own <html> and <body>.
//
// It is the only place a root layout crash is ever reported from. Without it
// that class of failure reaches Next's built-in screen and is never recorded.
//
// Same rule as app/error.tsx and for the same reason: no translations, no
// hooks of ours, no context, no design system. Everything this renders has to
// work when the app around it has already failed to boot, so the styles are
// inline rather than Tailwind classes, which may not have loaded.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    try {
      Sentry.captureException(error);
    } catch {
      // Reporting must not turn a handled error into an unhandled one.
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b0b0b",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "46ch", textAlign: "center" }}>
          <div style={{ fontSize: "20px", fontWeight: 600 }}>Something went wrong</div>
          <p style={{ marginTop: "8px", fontSize: "13.5px", color: "rgba(255,255,255,0.55)" }}>
            The app failed to start. Your funds are untouched. Reloading usually fixes it.
          </p>
          <div style={{ marginTop: "20px" }}>
            {/* A full reload, not Next's reset(). The root layout is what
                failed, so re-rendering it in place would land right back here. */}
            <button
              onClick={() => window.location.reload()}
              style={{
                cursor: "pointer",
                borderRadius: "999px",
                border: "none",
                background: "#ffffff",
                color: "#000000",
                padding: "8px 16px",
                fontSize: "12.5px",
                fontWeight: 600,
              }}
            >
              Reload
            </button>
          </div>
          {error.digest ? (
            <p
              style={{
                marginTop: "16px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "11px",
                color: "rgba(255,255,255,0.25)",
              }}
            >
              Ref {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
