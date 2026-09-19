import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("features/casino/components/chess-app/chess-site-shell.tsx", "utf8");
const profileBalance = readFileSync(
  "features/casino/components/chess-app/chess-profile-balance.tsx",
  "utf8"
);
const lobbyFrame = readFileSync(
  "features/casino/components/chess-app/chess-lobby-frame.tsx",
  "utf8"
);
const chessLayout = readFileSync("app/(session)/casino/chess/layout.tsx", "utf8");
const routeShell = readFileSync(
  "features/casino/components/chess-app/chess-route-shell.tsx",
  "utf8"
);
const styleBoundary = readFileSync(
  "features/casino/components/chess-app/chess-style-boundary.tsx",
  "utf8"
);
const headerActionsCss = readFileSync(
  "features/casino/components/chess-app/chess-profile-balance.module.css",
  "utf8"
);
const siteCss = readFileSync("public/chess/lichess/css/site.css", "utf8");
const themeCss = readFileSync("public/chess/lichess/css/theme.css", "utf8");

describe("chess dark canvas", () => {
  it("uses the same minimal Lichess navigation on React chess pages", () => {
    expect(shell).toContain('id="top"');
    expect(shell).toContain('className="chess-site-header"');
    expect(shell).toContain('"ark-chess-page relative bg-black text-white"');
    expect(shell).toContain('className="site-title-nav"');
    expect(shell).toContain('className="site-title"');
    expect(shell).toContain('id="topnav"');
    expect(shell).toContain('className="topnav-link"');
    expect(shell).toContain('label: "Play"');
    expect(shell).toContain('label: "Puzzles"');
    expect(shell).toContain('label: "Learn"');
    expect(shell).toContain('label: "Watch"');
    expect(shell).not.toContain('label: "Community"');
    expect(shell).not.toContain('label: "Tools"');
    expect(shell).not.toContain("AccountModal");
    expect(shell).not.toContain("useCasinoWallet");
    expect(shell).not.toContain("usePortfolio");
    expect(shell).toContain("Back to Arkade");
    expect(shell).toContain('className="arkade-mobile"');
    expect(shell).toContain("data-chess-header-actions-space");
    expect(shell).toContain('<ChessHeaderActions placement="header" />');
    expect(shell).not.toContain("<ChessProfileBalance />");
    expect(profileBalance).toContain("compact = false");
    expect(profileBalance).toContain('style={{ marginInlineEnd: compact ? undefined : "16px" }}');
    expect(profileBalance).toContain('href="/casino"');
    expect(profileBalance).toContain(">\n        Arkade\n      </Link>");
    expect(lobbyFrame).not.toContain("<ChessProfileBalance />");
    expect(chessLayout).toContain("<ChessRouteShell>{children}</ChessRouteShell>");
    expect(routeShell).toContain("<ChessHeaderActions />");
    expect(routeShell).toContain("<ChessStyleBoundary />");
    expect(routeShell).toContain("data-chess-setup-open");
    expect(shell).not.toContain('<link rel="stylesheet"');
    expect(styleBoundary).toContain('link.dataset.lichessRound === "true"');
    expect(styleBoundary).toContain('href.startsWith("/css/")');
    expect(profileBalance).toContain("data-chess-header-actions");
    expect(profileBalance).toContain('placement?: "header" | "overlay"');
    expect(profileBalance).toContain("data-placement={placement}");
    expect(profileBalance).toContain("w-[232px]");
    expect(profileBalance).toContain("min-[1020px]:w-[304px]");
    expect(profileBalance).toContain("h-[52px]");
    expect(profileBalance).toContain("min-[1020px]:h-[60px]");
    expect(profileBalance).toContain('import { usePortfolio } from "@/hooks/use-portfolio"');
    expect(profileBalance).toContain('usePortfolio({ scope: "base" })');
    expect(profileBalance).not.toContain("useCasinoWallet");
    expect(profileBalance).not.toContain("fetch(");
    expect(headerActionsCss).toContain(".arkadeAction");
    expect(headerActionsCss).toContain(".profileAction");
    expect(headerActionsCss).toContain(".legacyAction");
    expect(headerActionsCss).toContain("padding-inline: 0.75rem");
  });

  it("uses the Twitter/X black canvas across React and Lichess pages", () => {
    expect(shell).toContain('"ark-chess-page relative bg-black text-white"');
    expect(shell).not.toContain("linear-gradient(180deg, #0d1012");
    expect(lobbyFrame).toContain(
      "block h-[calc(100dvh-158px-var(--ws-live-bar,0px))] min-h-[520px] w-full border-0 bg-black transition-opacity duration-150"
    );
    expect(lobbyFrame).not.toContain("fixed inset-0 h-dvh");
    expect(siteCss).toMatch(/body \{\s+background: #000;/);
    expect(siteCss).toContain(
      "---site-header-sticky-padding: max(0px, calc((100vw - 1780px) / 2));"
    );
    expect(siteCss).toContain("grid-template-columns: minmax(0, 1fr) 304px;");
    expect(siteCss).toContain(".ark-chess-page #top.chess-site-header");
    expect(siteCss).toContain("grid-template-rows: 52px 52px;");
    expect(siteCss).toContain("---site-header-height: 104px;");
    expect(siteCss).toContain(".ark-chess-page #topnav");
    expect(siteCss).toContain("position: static;");
  });

  it("preserves the existing component surface colors", () => {
    expect(themeCss).toContain("--c-bg: hsl(var(---site-hue) 7% 14%);");
    expect(themeCss).toContain("--c-bg-mid: hsl(var(---site-hue) 7% 16%);");
    expect(themeCss).toContain("--c-bg-low: hsl(var(---site-hue) 7% 22%);");
  });
});
