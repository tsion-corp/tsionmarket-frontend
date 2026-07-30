import { redirect } from "next/navigation";

// The vault game now lives inside the Casino hub as "Last Man Standing". This
// route sticks around so old links and bookmarks keep working.
export default function VaultPage() {
  redirect("/casino/last-standing");
}
