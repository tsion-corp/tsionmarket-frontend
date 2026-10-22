// Next.js file convention: runs on the client after the HTML loads but
// before React hydrates, which makes it the right place to boot analytics.
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md.

import { initClarity } from "@/lib/analytics/clarity";

void initClarity();
