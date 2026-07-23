import { redirect } from "next/navigation";

// Real-world assets now live inline on the dashboard, not on a separate page.
export default function RwaPage() {
  redirect("/dashboard#rwa");
}
