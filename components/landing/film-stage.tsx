import { Fragment, type CSSProperties } from "react";
import { FILM, scrimGradient } from "@/lib/landing/journey";

// The fixed film behind the whole landing journey: for each waypoint a poster
// (fallback, shown until the ambient can play), an ambient loop (plays while
// the waypoint is held) and a transit clip (never played — the scroll engine
// writes its currentTime directly). The scrim protects the navbar and footer
// edges; the vignette pulls the eye to the centre of the shot. The engine
// drives every opacity; everything starts hidden.
//
// The film is decoration: aria-hidden keeps 17 silent videos out of the
// accessibility tree.

const LAYER: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  opacity: 0,
  transition: "opacity .3s linear",
};

export function FilmStage() {
  return (
    <div aria-hidden="true" className="fixed inset-0 z-0 overflow-hidden bg-black">
      <div className="absolute inset-0">
        {FILM.map((w, i) => (
          <Fragment key={w.still}>
            <div
              data-film-poster=""
              style={{
                ...LAYER,
                objectFit: undefined,
                backgroundImage: `url(${w.still})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                transition: "opacity .45s linear",
              }}
            />
            <video
              data-film-amb=""
              muted
              loop
              playsInline
              // Only the opening waypoint's clips load eagerly; the engine
              // warms the rest as the camera approaches them.
              preload={i <= 1 ? "auto" : "none"}
              poster={w.still}
              src={w.ambient}
              style={LAYER}
            />
            {w.transit != null ? (
              <video
                data-film-transit=""
                muted
                playsInline
                preload={i === 0 ? "auto" : "none"}
                poster={w.still}
                src={w.transit}
                style={LAYER}
              />
            ) : null}
          </Fragment>
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: scrimGradient() }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}
