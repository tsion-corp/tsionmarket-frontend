import { redirect } from "next/navigation";

// The vault game lives inside the Casino hub as The Last Man, which is hidden on
// production. This route stays so old links and bookmarks keep working; it
// points at the hub until the game comes back.
export default function VaultPage() {
  redirect("/casino");
}
