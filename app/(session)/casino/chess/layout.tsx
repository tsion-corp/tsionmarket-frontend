import { headers } from "next/headers";
import { ChessRouteShell } from "@/features/casino/components/chess-app/chess-route-shell";

export default async function ChessLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const embedded = requestHeaders.get("sec-fetch-dest") === "iframe";

  return embedded ? children : <ChessRouteShell>{children}</ChessRouteShell>;
}
