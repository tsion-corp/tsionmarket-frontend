import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

const fetchMySubmissions = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({ ready: true, authenticated: false }),
}));
vi.mock("@/features/earn/lib/api/submissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/earn/lib/api/submissions")>()),
  fetchMySubmissions,
}));

import { ApplicationsSection } from "@/features/earn/components/applications-section";

describe("Earn personal pages without a session", () => {
  it("ask for a sign-in and read nothing", () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <ApplicationsSection />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    expect(screen.getByText(messages.auth.signInToContinue)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.auth.signIn })).toBeInTheDocument();
    expect(fetchMySubmissions).not.toHaveBeenCalled();
  });
});
