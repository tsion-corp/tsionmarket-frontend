import { redirect } from "next/navigation";

// The Last Man is hidden on production (2026-09-15). The vault service settles
// against the v5 contract while this app still opens games on v4, so the keeper
// calls settle() where the game does not exist, reverts GameNotFound, and the
// pot is stranded until someone settles it by hand.
//
// The lobby is kept as a redirect rather than deleted so a shared link or a
// bookmark lands somewhere real. Restoring the game is restoring this file and
// [gameId]/page.tsx from git, and uncommenting the catalogue entry in
// features/casino/lib/games.ts. See vault-v5-cutover-report.md.
export default function LastStandingPage() {
  redirect("/casino");
}
