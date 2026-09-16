import { redirect } from "next/navigation";

export default function ChessCreatePage() {
  redirect("/casino/chess?setup=friend#game-setup");
}
