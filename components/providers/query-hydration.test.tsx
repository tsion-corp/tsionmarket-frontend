import { describe, expect, it } from "vitest";
import { Suspense } from "react";
import { render } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  type DehydratedState,
} from "@tanstack/react-query";
import { QueryHydration } from "@/components/providers/query-hydration";

function snapshotWith(key: readonly unknown[], data: unknown): DehydratedState {
  const server = new QueryClient();
  server.setQueryData(key, data);
  return dehydrate(server);
}

// A promise React's `use` can read without suspending: it carries the settled
// status the way a promise streamed from a Server Component does by the time
// the client reads it. In this test environment a bare resolved promise never
// resumes the Suspense boundary, so the component's own logic, reading the
// value and handing it to HydrationBoundary, is exercised this way instead.
function settled<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled", value });
}

function mount(client: QueryClient, snapshot: Promise<DehydratedState | null>) {
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <QueryHydration snapshot={snapshot} />
      </Suspense>
    </QueryClientProvider>
  );
}

describe("QueryHydration", () => {
  it("puts a server snapshot in the browser cache", () => {
    const client = new QueryClient();
    const key = ["portfolio", "0xabc", null] as const;

    mount(client, settled(snapshotWith(key, { totalUsd: 7, tokens: [] })));

    expect(client.getQueryData(key)).toEqual({ totalUsd: 7, tokens: [] });
  });

  it("does nothing with a null snapshot", () => {
    const client = new QueryClient();
    mount(client, settled(null));
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("does not overwrite a fresher value the browser already holds", async () => {
    const client = new QueryClient();
    const key = ["portfolio", "0xabc", null] as const;
    // The server started first, so its snapshot is older than the refetch
    // that landed in the browser after, say, a trade.
    const older = snapshotWith(key, { totalUsd: 1, tokens: [] });
    await new Promise((r) => setTimeout(r, 5));
    client.setQueryData(key, { totalUsd: 2, tokens: [] });

    mount(client, settled(older));

    expect(client.getQueryData(key)).toEqual({ totalUsd: 2, tokens: [] });
  });

  it("replaces a value the browser holds when the server's is newer", async () => {
    const client = new QueryClient();
    const key = ["portfolio", "0xabc", null] as const;
    client.setQueryData(key, { totalUsd: 1, tokens: [] });
    await new Promise((r) => setTimeout(r, 5));
    const newer = snapshotWith(key, { totalUsd: 3, tokens: [] });

    mount(client, settled(newer));

    // Existing queries are updated in an effect, which render has flushed.
    expect(client.getQueryData(key)).toEqual({ totalUsd: 3, tokens: [] });
  });
});
