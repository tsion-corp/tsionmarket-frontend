import { redirect } from "next/navigation";

// The interests step was removed. Old links land on the dashboard.
export default function InterestsPage() {
  redirect("/dashboard");
}
