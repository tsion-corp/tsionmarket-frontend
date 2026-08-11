# Restructure log

What the 2026-08 restructure changed and what it taught. `ARCHITECTURE.md`
describes the result; this file records how it got there, because most entries
below are a case of the obvious answer being wrong.

Measured against `main` at `49e85b1`.

---

## The audit that started it

| Signal                  | Then                  | Read                                                                                                                     |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| BFF proxy routes        | 43                    | Keys never reach the browser. Sound, kept as is.                                                                         |
| Client transports       | 4 + `apiFetch`        | `vault-api`, `casino/api/client`, `chess-client`, `earn/api/client` each redefined base path, error text and unwrapping. |
| Files over 400 lines    | 29                    | Largest `play-section.tsx` at 1,530.                                                                                     |
| Client components       | 246 of 327            | 75 percent, two server pages, neither fetching.                                                                          |
| Query hooks             | 57 of 105             | TanStack Query was already the data layer.                                                                               |
| Tests                   | 985 across 94 files   | Logic well covered, 4 component tests, 0 end to end.                                                                     |
| CI gates                | 4                     | No `tsc --noEmit`.                                                                                                       |
| `components/dashboard/` | 180 of 245 components | 73 percent of all components in one folder with 28 children.                                                             |
| Cross-feature imports   | 3 files               | The only genuine coupling. Everything else was the shell mounting a view.                                                |

The verdict was that a real architecture already existed, a BFF proxy layer,
tested logic in `lib/`, one data layer, but it was neither written down nor
enforced, so every feature reinvented its transport, envelope and folder. The
fix was to name it, delete what was dead, and put a linter behind it. Not a
rewrite.

---

## Phase 1: cleanup

**1.1 and 1.2, the dead casino stack.** `casino-service/` was a Fastify backend
committed inside this repository: 13 files, its own `package.json`,
`pnpm-workspace.yaml` and lockfile, which can confuse tooling that infers a
workspace root. Nothing imported it and Vercel never deployed it. It left a
client chain wired into two shipped pages, ending at `NEXT_PUBLIC_CASINO_API_URL`,
which was unset.

Draw was the harder call, and the investigation is why it went: roughly 771
lines of finished lottery UI whose backend was never built. The deleted service
held the proof, a handler commented `Draw (not implemented yet)` that threw
`NOT_CONFIGURED`, because a draw needs a scheduler and an auditable randomness
source. Nothing linked to it either. The games tile is `href: null,
comingSoon: true`, and the `/casino/draw` entry in `SECTION_LABEL` was a
back-link label rather than navigation, so the only way in was typing the URL,
which showed a permanent error card. Two routes, four components, a hook, an api
module, a transport, a proxy route, its tests and 26 i18n keys per locale went.
The tile stays, so the product intent is still visible.

**1.3 `tsc --noEmit` in CI.** `next build` only typechecks what the build graph
reaches, which excludes tests, unreferenced modules and anything tree-shaken.

**1.4 knip.** 28 unused files reported, 11 genuinely dead. The largest was the
Jupiter swap path, superseded by the holdings buy and sell flow in PR #33.

The other 17 are the interesting half. Three are referenced by string and so
invisible to static analysis: `public/sw.js` is passed to
`navigator.serviceWorker.register`, the Stockfish build is a `workerUrl`, and
`vitest.server-only-stub` is a `vitest.config` alias. Deleting the first would
have silently killed push notifications, with a green build and green tests.

The remaining 14 were the in-house voice pipeline, and tracing them found
something the tool could not: the assistant is still live, just not ours.
`app/layout.tsx` loads an external Vivid widget script and `VividWidgetDock`
renders `null` and only positions it. The in-house recorder, orb, transcript
panel, wake word and ElevenLabs proxy were that widget's predecessor, left
commented out in `app/providers.tsx` rather than removed. All 19 went, with
`app/api/tts` and five environment variables nothing read.
`lib/voice/{intent,prefill,chain-match,dock}` stayed, because they carry the
deposit and trade prefill types that funds, trade and rwa still use, which is
why that folder outlives its own feature.

**1.6 and 1.7.** The PR template told contributors to target `dev`, deleted on
2026-07-29, so every checklist run opened with a wrong instruction.
`PREDICTION_INTEGRATION_TODO.md` was the v1.2.0 backend guide whose steps all
shipped in PR #183.

---

## Phase 2: boundaries

**2.1 and 2.2, primitives in both directions.** Three genuinely shared
components went up to `components/ui/`: `sheet-nav` (12 consumers), `qr-code`,
`deposit-status`. Three feature components came down: `side-panel` and
`image-upload-field` to earn, `money-ticker` to casino.

`sparkline.tsx` was listed for demotion on usage count and stayed, which set the
rule now in `ARCHITECTURE.md`: judge `ui/` membership by whether the component
knows anything about a feature, not by how many places import it.

**2.3 One transport.** `createServiceClient(basePath, fallbackMessage)` defines
a service by those two facts rather than a copied wrapper. Earn, chess and vault
bind to it and keep their export names, so no call site changed. Vault lost a
duplicated `unwrap` that swallowed plain-text upstream errors and never checked
`res.ok`. Query building became uniform: `undefined` values are dropped instead
of being sent as the string `"undefined"`, which only earn did correctly before.

**2.4 Zod at the proxy boundary.** Two rules make validation safe on a live
route: it validates without transforming, so a field no schema models still
reaches the client, and it only judges successful envelopes, so an upstream
error passes through with its own status.

Checking schemas against live responses beat reading the spec, twice. The
gateway types `yieldApyBps` as an integer and returns `null` for 29 of 45
assets, while our own type said `number | undefined`. And `/tokens/search`
returns a bare array where `/tokens` and `/tokens/trending` return `{ items }`,
so the three cannot share a schema.

---

## Phase 3: slices

The recurring lesson, visible in almost every slice: **what looks like feature
code is often cross-cutting code that arrived with the first feature to need
it.** Measuring importers before moving anything is what caught it each time.

**3.1 rwa**, the pilot, disproved its own plan. `lib/rwa/funding.ts` was the
cross-chain funding engine three other hooks depended on, and `USDC_BY_CHAIN` is
a chain constant, not an RWA concept. Both had to come out first, or the slice
would have inherited false ownership.

**3.2 The lint rules.** Two policies: a feature may not import another feature,
and `lib`, `components/ui` and `hooks` may not import upward. Verified by
planting each violation and confirming the right message fires.

It immediately caught a real one: `use-global-search` sat in shared `hooks/`
while importing `@/features/rwa`. It aggregates portfolio, market tokens and RWA
for exactly one consumer, the topbar, which makes it shell composition rather
than shared infrastructure.

**3.3 portfolio.** `usePortfolio` deliberately stayed in `hooks/`. With 34
importers across every feature area it is the app's balance source, and burying
it in the slice would have forced every other slice to import through a
portfolio index. Naming that gap is why `hooks/` exists as a layer.

**3.4 funds.** `lib/pouch/` split three to three. `banks`, `kyc` and `session`
were funds-only; `offramp`, `onramp` and `pending` are read by API routes and
the portfolio balance card. `session.ts` looked shared because it sat in `lib/`,
but its only app consumers were two funds screens.

**3.5 remit.** `lib/pouch/*` reads like remit and is not: it is the PouchPay NGN
bank rail with six consumers. Two different off-ramps, one word. Moving the
banner also exposed a portfolio-to-remit import, fixed with a slot prop rather
than a relaxed rule.

**3.6 prediction**, the largest at 66 files. The first sweep flagged 20 leaks
and nearly killed the move. Almost all were prediction code shelved elsewhere:
two views under `components/dashboard/views/`, and `use-bet`, `use-settle`,
`use-create-event`, `use-lp-auto-return` sitting in the flat hooks folder with
names generic enough to look shared. Drawing the boundary correctly left one.
Three files stayed for the server, which is where the `lib/server/` rule comes
from: a route handler importing a slice barrel drags client components into the
server bundle, and no lint rule catches it.

**3.7 trade.** All of `lib/` stayed; it is the most entangled slice.
`PerpConfirmModal` had no perp knowledge at all, only a title, rows and
callbacks, so it became `components/ui/confirm-dialog`, which is what it always
was. Its name came from its first caller.

**3.8 earn** moved whole, the only slice that did, because it talks to its own
gateway service and shares no money rails.

**3.9 casino.** `lib/casino/chess-identity` left the folder rather than joining
the slice: it imports `@privy-io/node` and its only callers are two route
handlers, one of them the perp proxy. Server code filed under a client feature.

**3.10 `components/dashboard/` dissolved.** Of 190 files, 165 were feature
components and 12 were shell. The remaining 13 are the useful part of the count:
two design-system primitives, one pure type contract that belonged in `lib/`,
and a whole activity slice split across two folders. The lint map lost its
`legacy` escape hatch in the same commit.

**3.11 Colocating tests** put the boundary rules over the tests too, which
caught a schema test in `lib/` importing `formatApy` from `features/rwa`. It was
testing two layers at once.

### Three ways to compose across features

Each cross-feature coupling was fixed rather than exempted, and which fix
depends on who owns the state. All three are now in `ARCHITECTURE.md`.

| Coupling                            | Owner of the state                      | Fix                      |
| ----------------------------------- | --------------------------------------- | ------------------------ |
| portfolio showed remit's banner     | neither, it is static                   | slot prop                |
| portfolio opened trade's sell sheet | portfolio                               | callback up to the route |
| casino opened trade's sell sheet    | casino, deep in an 1,100-line component | render prop              |

The render prop was chosen over lifting state because it leaves the JSX tree
byte-identical, which matters when the component is too large to verify by
reading.

---

## The one thing every gate missed

Creating `features/` broke the entire dashboard's styling, and nothing caught it.

`app/globals.css` imports Tailwind with `source(none)`, which turns off
automatic content detection, and then lists the directories to scan. The list
was `app`, `components`, `lib`, `hooks`. Moving 320 files into `features/` put
the whole product UI in a directory Tailwind never read, so every class used
only inside a slice was dropped from the stylesheet.

Typecheck passed. ESLint passed. 1,001 tests passed. The production build
succeeded. The integrity audit below, blob hashes and exported symbols and
routes and locales, was clean, because not one byte of TypeScript was wrong. The
markup was correct and the stylesheet was incomplete, and no tool in the
pipeline compares those two things.

It surfaced when a screen recording of the dashboard was put next to one taken
before the work: the holdings table had lost the columns from
`grid-cols-[2fr_1fr_1fr_1fr_1fr]`, the Kash banner had lost its height
constraint, the perps amount button had lost its padding. One line fixed it.

Two lessons, both now in `ARCHITECTURE.md`. A new top-level directory has to be
added to `globals.css`, because the failure is silent. And a green pipeline says
the code compiles, not that the product renders, which is the gap Playwright is
meant to close.

## Verification

The whole branch was checked for lost code by blob hash and exported symbol,
not by reading diffs. 385 files were renamed, 363 of them byte-identical outside
their import lines. Exported symbols went from 1,924 to 1,877, and all 72 absent
fall into six deliberate groups: Draw, the dead casino hub, the transport merge,
the voice pipeline, the Jupiter swap path, and retired funds screens, plus one
rename. No route was lost and all five locales stayed at 1,869 keys.
