import { redirect } from "next/navigation";

// Arkjet is not offered on production: its gateway service, `arkjet`, answers
// 502 on api.tsionark.com, so nothing behind this page can load.
//
// The route is kept as a redirect rather than deleted so a shared link or a
// bookmark lands somewhere real. Restoring the game is restoring this file
// from git and uncommenting its entry in features/casino/lib/games.ts and its
// card in features/discovery/components/arkade-row.tsx.
export default function ArkjetPage() {
  redirect("/casino");
}
