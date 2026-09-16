"use client";

import Image from "next/image";

const SPORT_ICON_FILES: Record<string, string> = {
  football: "b5afeda01c8667d61cccfcf5.png",
  tennis: "7fe3be67febb393c3ddc8e49.png",
  "ice-hockey": "e1046aa59d39c9977fe256dd.png",
  hockey: "e1046aa59d39c9977fe256dd.png",
  baseball: "d8dfb8ab4326de0ea9b869f7.png",
  rugby: "c29f3cc2ef17134254388194.png",
  "rugby-league": "c29f3cc2ef17134254388194.png",
  "rugby-union": "c29f3cc2ef17134254388194.png",
  mma: "2a69b461b9932e74e3bf0dfc.png",
  boxing: "ace21aff20bc09b12b3b7e70.png",
  volleyball: "98b02f127f01cee2c7d17a5b.png",
  "american-football": "e7ee585c0a399cef922d2fab.png",
  basketball: "768a65be34b08ba9011866da.png",
  lol: "668daf1a1701a230d11358b6.png",
  "league-of-legends": "668daf1a1701a230d11358b6.png",
  cs2: "e332496514d88c770c9e7063.png",
  "counter-strike": "e332496514d88c770c9e7063.png",
  "counter-strike-2": "e332496514d88c770c9e7063.png",
  "dota-2": "2acea44d2533e9152a084f57.png",
  dota2: "2acea44d2533e9152a084f57.png",
};

export function SportIcon({
  sport,
  name,
  className = "",
}: {
  sport: string;
  name: string;
  className?: string;
}) {
  const normalized = sport.toLowerCase();
  const file =
    SPORT_ICON_FILES[normalized] ??
    (normalized.startsWith("rugby") ? SPORT_ICON_FILES.rugby : undefined);

  if (!file) {
    return (
      <span
        aria-hidden="true"
        className={`grid place-items-center rounded-full bg-[#2e2e2e] text-sm font-bold text-[#999] ${className}`}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={`/images/sportsbook/${file}`}
      alt=""
      width={250}
      height={250}
      className={`object-contain drop-shadow-[0_10px_10px_rgba(0,0,0,.42)] ${className}`}
      priority={sport === "football"}
    />
  );
}
