"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CasinoError, CasinoLoading } from "@/features/casino/components/casino-state";
import {
  installLichessRuntime,
  loadLichessStyle,
  type LichessPowertip,
} from "@/features/casino/components/chess-app/lichess-round";
import { LEARN_EN } from "@/features/casino/components/chess-app/learn/learn-en";

type LearnModule = {
  initModule(options: {
    data?: { _id?: string; stages: Record<string, { scores: number[] }> };
    pref: { coords: number; destination: boolean; is3d: boolean };
  }): Record<string, never>;
};

const LEARN_MODULE = "/compiled/learn.DPG2CHNN.js";
const LEARN_CSS = "/css/learn.209a2b25.css";
const SITE_CSS = "/css/site.5a4b7c75.css";
const THEME_CSS = "/css/lib.theme.all.ca09c987.css";

const inertPowertip: LichessPowertip = {
  watchMouse() {},
  manualUser() {},
  manualUserIn() {},
  dispose() {},
};

function installLearnI18n(): void {
  type Translation = string | ((...values: unknown[]) => string);
  const global = window as unknown as {
    i18n?: Record<string, Record<PropertyKey, Translation>>;
  };
  const fallback = global.i18n?.site ?? {};
  global.i18n ??= {};
  global.i18n.learn = new Proxy(fallback, {
    get(target, property) {
      const key = String(property) as keyof typeof LEARN_EN;
      const translation = LEARN_EN[key];
      if (!translation) return Reflect.get(target, property);
      if (!translation.includes("%s")) return translation;
      return (...values: unknown[]) => {
        let index = 0;
        return translation.replaceAll("%s", () => String(values[index++] ?? ""));
      };
    },
  });
}

function routeLearnLink(href: string, router: ReturnType<typeof useRouter>): boolean {
  if (href.startsWith("/learn#")) {
    window.location.hash = href.slice(href.indexOf("#"));
    return true;
  }
  if (href === "/learn") {
    window.location.hash = "";
    return true;
  }

  const routes: Record<string, string> = {
    "/practice": "/casino/chess/learn/practice",
    "/training": "/casino/chess/puzzles",
    "/#hook": "/casino/chess",
    "/#ai": "/casino/chess?setup=computer",
    "/signup": "/auth",
  };
  const destination = routes[href];
  if (!destination) return false;
  router.push(destination);
  return true;
}

export function LearnSection() {
  const router = useRouter();
  const hostRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    const onClick = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      const href = anchor?.getAttribute("href");
      if (!href || !routeLearnLink(href, router)) return;
      event.preventDefault();
    };
    host.addEventListener("click", onClick);

    void (async () => {
      try {
        document.body.dataset.assetUrl = "";
        document.body.classList.add("is2d");
        installLichessRuntime(undefined, inertPowertip);
        // The shared runtime defaults to round mode. Learn pages scroll normally.
        document.body.classList.remove("fixed-scroll", "playing");
        installLearnI18n();
        await Promise.all([
          loadLichessStyle(THEME_CSS),
          loadLichessStyle(SITE_CSS),
          loadLichessStyle(LEARN_CSS),
        ]);
        if (cancelled) return;
        const module = (await import(/* webpackIgnore: true */ LEARN_MODULE)) as LearnModule;
        if (cancelled) return;
        module.initModule({
          pref: {
            coords: 2,
            destination: true,
            is3d: false,
          },
        });
        setReady(true);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason : new Error("Unable to initialize Chess Basics"));
        }
      }
    })();

    return () => {
      cancelled = true;
      host.removeEventListener("click", onClick);
      document.body.classList.remove("is2d");
    };
  }, [router]);

  if (error) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-10">
        <CasinoError error={error} subject="Chess Basics" />
      </div>
    );
  }

  return (
    <div id="main-wrap" className="min-h-[calc(100dvh-60px)]" style={{ marginTop: 0 }}>
      {!ready ? (
        <div className="col-start-3 w-full py-12">
          <CasinoLoading label="Loading Chess Basics" rows={6} />
        </div>
      ) : null}
      <main id="learn-app" ref={hostRef} aria-busy={!ready} />
    </div>
  );
}
