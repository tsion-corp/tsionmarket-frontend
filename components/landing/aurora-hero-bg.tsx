"use client";

// Background-only adaptation of the vengenceui "Aurora Hero": the animated
// fluted-stripe + shimmer difference-blend layer, retinted to TSION monochrome
// (silver on near-black) to blend with the dark page. The title and full-screen
// fluted-glass content layer are dropped so it sits behind each section's own
// content.
export function AuroraHeroBackground() {
  return (
    <div aria-hidden className="ws-aurora absolute inset-0 z-0 overflow-hidden">
      <style>{`
        .ws-aurora {
          --stripe-color: #0a0a0c;
          /* No saturate: the shimmer is greyscale, so keep it neutral. */
          --bg-filter: blur(12px) opacity(45%);
          background: #08080a;
        }
        @keyframes wsAuroraShift {
          from { background-position: 50% 50%, 50% 50%; }
          to { background-position: 350% 50%, 350% 50%; }
        }
        .ws-aurora-bg {
          position: absolute;
          inset: 0;
          --stripes: repeating-linear-gradient(
            100deg,
            var(--stripe-color) 0%,
            var(--stripe-color) 7%,
            transparent 10%,
            transparent 12%,
            var(--stripe-color) 16%
          );
          /* Silver shimmer: greyscale steps only, no hue. */
          --rainbow: repeating-linear-gradient(
            100deg,
            #5c5c62 10%,
            #e8e8ea 15%,
            #6c6c72 20%,
            #3c3c40 25%,
            #808088 30%
          );
          background-image: var(--stripes), var(--rainbow);
          background-size: 300%, 200%;
          background-position: 50% 50%, 50% 50%;
          filter: var(--bg-filter);
          mask-image: radial-gradient(ellipse at 100% 0%, black 40%, transparent 70%);
          -webkit-mask-image: radial-gradient(ellipse at 100% 0%, black 40%, transparent 70%);
        }
        .ws-aurora-bg::after {
          content: "";
          position: absolute;
          inset: 0;
          background-image: var(--stripes), var(--rainbow);
          background-size: 200%, 100%;
          animation: wsAuroraShift 60s linear infinite;
          mix-blend-mode: difference;
        }
        @media (prefers-reduced-motion: reduce) {
          .ws-aurora-bg::after {
            animation: none;
          }
        }
      `}</style>
      <div className="ws-aurora-bg" />
    </div>
  );
}
