import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache store: R2 needs a paid checkout and KV's 1,000 writes a
// day is too few, so fetch() revalidation falls through to the upstream.
export default defineCloudflareConfig({});
