import { ClerkScope } from "@/components/auth/clerk-scope";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ClerkScope>{children}</ClerkScope>;
}
