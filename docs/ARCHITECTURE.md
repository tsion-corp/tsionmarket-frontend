# Frontend Architecture

How this frontend is structured and why. Read it before adding a directory, a
transport, or a shared component.

- `CONTRIBUTING.md` is the working agreement: setup, PR flow, style.
- `.claude/skills/wsws-engineering-standards/SKILL.md` is the coding bar.
- `RESTRUCTURE-LOG.md` is how the codebase got this shape, and what that taught.

This app moves real money. That is the reason for every rule below.

---

## 1. The rule

Four layers. Every import points downward. That is the whole model.

```
app/                routes and BFF handlers. Composes features, owns no logic.
   |  may import
components/layout/  the app shell. The one place below app/ that composes features.
   |  may import
features/           vertical slices. Never import a sibling.
   |  may import
components/ui/      design system primitives. Know nothing about any feature.
hooks/              cross-cutting React hooks. Same rule, same layer.
   |  may import
lib/                pure cross-cutting: api client, money, format, brand.
```

`components/ui/` and `hooks/` are siblings on the shared layer: one holds
presentation primitives, the other behaviour every feature needs. `lib/` sits
below both and stays framework-free, which is why a hook cannot live there.

A feature slice is not a silo. It is the layer that consumes the shared floor.

### Four consequences

1. **Features never import each other, not even through the index.** They are
   siblings; the route composes them. See [section 4](#4-composing-across-features).
2. **`lib/` is for what two or more features need.** If only RWA uses it, it
   belongs in `features/rwa/lib/`.
3. **A hook belongs in `hooks/` when it is generic behaviour, not when it has
   many callers.** Same test as `components/ui/` below: does it know anything
   about a feature? `usePortfolio` is shared because it is the app's balance
   source, and 34 importers confirm it. But `useDebouncedValue`, `useQrScanner`
   and `useTokenLogos` also stay, each with a single caller today, because
   nothing about them is tied to the feature that happens to use them. The
   inverse is `usePerpOrders`, which is the perps product surface and lives in
   `features/trade/hooks/` even though the count alone would not say so.
4. **Anything a route handler needs belongs in `lib/server/`.** Importing a
   slice barrel into a route handler drags client components into the server
   bundle. The lint rules allow it, so this one is on you.

### Deciding where a component belongs

Judge membership of `components/ui/` by whether the component knows anything
about a feature, not by how many places import it. A `Switch` is a primitive
even if used once. A `MoneyTicker` that understands casino wins is a feature
component that happens to live upstairs.

---

## 2. Structure

```
app/                    routes and BFF only
  layout.tsx            root: fonts, locale, and providers.tsx (query, toaster)
  page.tsx  privacy/  welcome/  r/   outside every group: no wallet SDK
  (session)/            everything that needs Privy; see section 9
    layout.tsx          providers.tsx: Privy, broadcast, analytics, once
    (app)/              the product routes, under one mounted shell
      layout.tsx        AppShell: auth guard + DashboardShell, once
      loading.tsx       the content column while a route loads
      error.tsx         catches a route crash below the shell
      dashboard/ spot/ perps/ meme/ rwa/ prediction/ activity/
    auth/  interests/   sign-in and onboarding
    casino/  earn/      still mount the shell per page; see section 9
  api/                  49 route handlers, one folder per upstream service

features/               9 slices, 329 files. Each owns its whole vertical.
  <slice>/
    components/
    hooks/
    lib/                pure, unit tested
    index.ts            the only thing outside may import

components/
  ui/                   design system
  layout/               dashboard-shell, sidebar, topbar, nav-items, modals
  auth/  landing/  providers/  interests/  voice/

hooks/                  generic cross-cutting hooks, e.g. usePortfolio
lib/                    cross-cutting only
  api/                  client.ts, envelope.ts, service.ts, schemas/
  server/               server only. A client import must fail.
  trade/  money/  format/  brand.ts  currencies.ts  wsapi-base.ts

messages/               five locales: en, de, es, fr, pt
config/                 chain registries
docs/                   this file and the restructure log
__tests__/              only tests with no single subject
```

The nine slices: `activity`, `casino`, `earn`, `funds`, `portfolio`,
`prediction`, `remit`, `rwa`, `trade`.

Tests sit beside the code they cover and take its name, so `presenter.ts` is
covered by `presenter.test.ts` in the same folder and a slice can be read,
moved, or deleted with its tests attached.

---

## 3. Data flow

```
component -> hook (TanStack Query) -> lib client -> app/api/<service> -> gateway
```

- A component never calls `fetch` directly and never holds a base URL.
- Every upstream call goes through a route handler in `app/api/`. The handler
  holds the secret, allowlists the path, and verifies the Privy session.
- Every service URL derives from `WSAPI_BASE_URL` via `wsapiService("<service>")`.
  Per-service environment variables exist only as local overrides.
- One transport. `createServiceClient(basePath, fallbackMessage)` in
  `lib/api/service.ts` defines a service by those two facts. Do not write
  another wrapper.
- Upstream payloads are validated at the proxy boundary by
  `lib/server/validate-upstream.ts` and never reach a component raw. Schemas
  live in `lib/api/schemas/`. Validation does not transform, and only judges
  successful envelopes, so a field no schema models still reaches the client and
  an upstream error keeps its own status.
- Pure derivation, validation and money math live in a `lib/` file with tests.
  Components render, hooks orchestrate.
- Never use floating point for asset amounts. Base units and `bigint`, converted
  once at the display edge.

**The server path.** A Server Component reads through `lib/server/` directly,
never through its own `/api` route:

```
page.tsx -> lib/server/session.ts (cookie -> verified user) -> lib/server/<data> -> gateway
```

- `getSessionClaims` and `getSessionUser` verify the `privy-token` cookie once
  per request under React's `cache`. Identity is derived where it is used and
  never passed down as a prop.
- A page starts a prefetch and hands the promise down without awaiting it, so
  the page streams at once. `components/providers/query-hydration.tsx` reads
  the promise inside its own `<Suspense>` and puts the result in the query
  cache under the key the client hook builds, so the hook finds its data
  already there. The dashboard's balance is the first route on this path.
- Per-user reads on this path are never cached across requests. The only
  cache they touch is the per-wallet process cache the route handler shares.
- The `(app)` layout calls `getServerSession` and hands the browser the user
  id and wallet addresses (`lib/session.ts`). `AuthGuard` then shows the page
  at the first byte instead of waiting for Privy to start, and
  `useSessionWallet` gives hooks a wallet to key on until Privy knows the
  user. Privy remains the authority once it has answered.

**The dashboard feed.** Everything the dashboard shows that is the same for
every user, the four briefs and the marquee's live events, is composed once on
the server (`lib/server/dashboard-feed.ts`), cached for twenty seconds, served
anonymously by `app/api/dashboard/feed` with `public, s-maxage`, and
dehydrated into the first HTML beside the balance. The briefs and the marquee
read it through one query (`hooks/use-dashboard-feed.ts`), so an idle dashboard
makes one public request every thirty seconds where it made thirteen. A section
whose upstream is down is `null`; the brief shows its unavailable state and no
browser asks that upstream itself.

The rules the feed applies are the ones the features apply, because they now
live in `lib/`: `lib/rwa/catalog.ts` (what is listed), `lib/chess/live-match.ts`
(what is still being played), `lib/vault/read.ts` (the contract read),
`lib/spot-markets.ts` and `lib/perp/brief.ts` (the compositions),
`lib/meme/catalog.ts` (the normalisation). The feature files re-export them, so
their callers did not change. Nothing per user may enter the feed; per-user
reads stay on their own `private` routes.

---

## 4. Composing across features

A feature may not import another feature. When one feature's view has to show
another's, the route composes them. Which pattern depends on who owns the state.

**Static child: pass a slot.** The portfolio shows a cross-border banner, and
neither owns state:

```tsx
<PortfolioView crossBorderSlot={<CrossBorderBanner onClick={openCrossBorder} />} />
```

**The feature triggers, the route owns the modal: raise a callback.** Portfolio
opens trade's sell sheet, so it raises `onOpenMemeSell(token)` and
`app/(app)/dashboard` renders the sheet. This matches the `onOpen*` convention
portfolio already uses for buy, sell, detail and rwa.

**The feature owns the state and is too large to safely reshape: take a render
prop.** Last Man Standing opens trade's sell sheet from state buried in an
1,100-line component:

```tsx
<LastStandingSection
  renderWithdrawSheet={(payload, onClose) => <SellSheet payload={payload} onClose={onClose} />}
/>
```

Prefer the first two. The render prop exists because it leaves the JSX tree
untouched, which is worth something when the component is too large to verify by
reading.

If two slices keep reaching for each other, that is evidence they are one
feature. Merging them is the correct response.

---

## 5. Conventions

**Feature public surface.** Each slice exports only what others may use:

```ts
// features/rwa/index.ts
export { RwaSection } from "./components/rwa-section";
export { useRwaAssets } from "./hooks/use-rwa-assets";
export type { RwaAsset } from "./lib/types";
```

**Naming.** Files are kebab-case. Components are PascalCase and named for what
they are. Hooks are `use<Thing>`. A pure module is named for its domain, not its
shape: `presenter.ts`, `gas-buffer.ts`, never `utils.ts` or `helpers.ts`.

**Size.** A component over roughly 300 lines is usually holding three jobs:
server state, derivation, and layout. Extract the first two. There is no hard
limit, but 400 lines is where a reviewer should ask.

**Server components.** Default to server. Reach for `"use client"` only for
interactivity, browser APIs, or client state, and push the boundary as deep as
possible. New read-heavy pages should fetch on the server.

---

## 6. Enforcement

Structure that is not enforced decays. These are the mechanisms.

**`eslint-plugin-boundaries`** in `eslint.config.mjs` types every folder and
runs two policies: a feature may not import another feature, and `lib`,
`components/ui`, `hooks` and the rest of `components/` may not import upward
into `features`, `app` or `layout`. A violation fails `pnpm lint`.

Two traps if you edit that config. Element patterns match partially by default,
so `lib/**` also matches the `lib/` folder inside a slice and misattributes
errors until every descriptor sets `partialMatch: false`. And `internalPath`
inside a `to` selector is silently ignored, so "import a feature through its
index" cannot be expressed as a rule. It is convention, currently unbroken.

**The five gates**, in the order CI runs them: `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build`. Typecheck is separate from build
because `next build` only checks what the build graph reaches.

**`pnpm bundle:check`** runs after the build in CI and fails when a route's
initial client JavaScript exceeds its budget in `scripts/first-load-budget.json`.
`next build` no longer prints first-load sizes, so `scripts/first-load.mjs`
reads them from the build's own manifests and gzips the chunks. The budgets
are a ratchet: set just above what a route ships, lowered when it improves.

**`npx knip`** finds unused files, exports and dependencies. `knip.json` lists
the three entries it cannot see, each referenced by string rather than import.
Do not delete on knip's word alone; check for string and worker references
first.

**Adding a top-level directory means editing `app/globals.css`.** Tailwind runs
with `source(none)`, so it scans only the directories listed in the `@source`
lines. A class used only in an unlisted directory is dropped from the stylesheet
with no error and no warning, and the component renders unstyled while
typecheck, lint, tests and the build all stay green. Creating `features/`
without adding it there took the whole dashboard's grid and sizing utilities out
of the CSS.

---

## 7. Packages

Installed and load-bearing: `zod` for boundary validation,
`eslint-plugin-boundaries` for the layering, `@tanstack/react-query` as the data
layer for 58 of 92 hooks.

Worth adding, in order: `@playwright/test`, since an app that moves money has no
end-to-end coverage; `knip` as a devDependency once it earns a place in CI, run
through `npx` today; `@tanstack/eslint-plugin-query` for query key mistakes.

Deliberately not adding: a state manager (Query plus local state covers it), a
component library (there is a real design system in `globals.css` and adding one
would fragment it), a form library (forms are small), Storybook (high
maintenance for this team size, Playwright buys more).

---

## 8. What is left

The restructure is complete: nine slices, `components/dashboard/` gone, zero
cross-feature imports, boundaries enforced. None of the following blocks work.

- [ ] **Playwright specs against a preview deployment.** Log in, deposit,
      withdraw, buy, sell. This is what turns "the diff looks fine" into "the
      money still moves".
- [ ] **Split the two files over 1,000 lines.** `play-section.tsx` at 1,530 and
      `last-standing-section.tsx` at 1,177. Extract server state into hooks and
      derivation into tested `lib/` functions.

---

## 9. Open decisions

Recorded so they are chosen rather than defaulted into.

1. **Client versus server components.** 228 of 263 components are client
   components, with no server-side data fetching. That is a legitimate
   architecture, the App Router as a client router over a proxy layer, but it
   should be a decision. Current position: new read-heavy pages fetch on the
   server; existing pages are not migrated for their own sake.
2. **Route groups.** Built, for the product routes. `app/(app)/layout.tsx`
   mounts the shell once, so moving between the dashboard and the perps desk
   no longer tears down and rebuilds the sidebar, topbar, tab bar, funds modal
   and broadcast dock, and no longer re-runs their effects.

   The objection that held this back was `activeSection`: on `/dashboard` it
   is scroll-spy state, not a route fact, so a layout could not derive it. It
   is now context. `AppChromeProvider` (`components/layout/app-chrome.tsx`)
   derives the highlight from the path with `sectionForPathname`, and the
   dashboard reports its scroll-spy value as an override while it is mounted.
   The same provider builds the nav once, which removed nine copies of
   `buildNav(loadInterest(), t)`.

   Casino and earn are still outside the group. Casino switches its chrome by
   route from inside the feature (chess site shell, bare board, or the app
   shell), and earn wraps its ten routes the same way. Bringing each in is a
   change of its own: casino needs its immersive routes split into a sibling
   group, earn needs `EarnPage` reduced to its back link.

   The group also carries `loading.tsx` and `error.tsx`. Before it there was
   no loading boundary anywhere and one error boundary at the root, above the
   shell, so a crashing page took the navigation down with it.

   Above `(app)` sits `(session)`, whose layout mounts the Privy wallet SDK,
   the broadcast session and the analytics identity: everything a signed-in
   session needs and a signed-out page does not. Those used to be root
   providers, which put Privy, viem and livekit-client in front of the
   landing page and the privacy policy. Measured on the first-load path,
   the landing page went from 1,270 kB gzip to 249 kB and the privacy
   policy from 1,255 kB to 182 kB; the product routes did not change, as
   they pay for the session either way. Sign-in, onboarding, casino, earn
   and the legacy prediction reclaim are inside `(session)` because each
   reaches Privy.

3. **The casino hub.** `/casino` is a live route whose live-data path was
   deleted with the dead service. It degrades by design and stays, but the tiles
   promise more than the backend currently delivers.
