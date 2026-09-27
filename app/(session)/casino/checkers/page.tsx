import { redirect } from "next/navigation";

// Checkers is hidden on production (2026-09-27), by the team's call.
//
// The route is kept as a redirect rather than deleted so a shared invite link
// or a bookmark lands somewhere real instead of a 404. Restoring the game is
// restoring this file from git, together with the catalogue entry in
// features/casino/lib/games.ts, the discovery card in
// features/discovery/components/arkade-row.tsx and the live marquee arm in
// lib/dashboard-feed.ts.
export default function CheckersPage() {
  redirect("/casino");
}
