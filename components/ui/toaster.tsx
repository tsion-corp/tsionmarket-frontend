"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      duration={2600}
      gap={8}
      mobileOffset={{ top: 12 }}
      toastOptions={{
        style: {
          background: "color-mix(in srgb, var(--color-sheet) 96%, transparent)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "14px",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 20px 50px -20px rgba(0,0,0,0.9)",
          backdropFilter: "blur(14px)",
          fontFamily: "var(--font-sans), sans-serif",
          fontSize: "13.5px",
          fontWeight: 400,
          padding: "12px 16px",
        },
      }}
      icons={{
        success: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="m5 13 4 4L19 7"
              stroke="var(--color-up)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
        error: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="var(--color-down)" strokeWidth="1.8" />
            <path
              d="M12 8v5m0 3h.01"
              stroke="var(--color-down)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ),
        info: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="var(--color-accent)" strokeWidth="1.8" />
            <path
              d="M12 11v5m0-8h.01"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ),
      }}
    />
  );
}
