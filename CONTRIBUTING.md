# Contributing

Read this before your first change. It takes ten minutes and covers setup, where
code goes, and how work gets merged.

Two companion documents:

- `.claude/skills/wsws-engineering-standards/SKILL.md` is the coding bar:
  correctness, comments, naming, testing. Read it once, in full.
- `docs/ARCHITECTURE.md` is the shape of the codebase and why it is that shape.
  Check it before adding a directory, a transport, or a shared component.
  `docs/RESTRUCTURE-LOG.md` records how it got there, worth a look when a
  boundary seems arbitrary.

This app moves real money. That fact sets the standard for everything below.

---

## Setup

Requires Node 22 or 24 and pnpm. The version is pinned in `packageManager`; do
not use npm or yarn.

```bash
pnpm install
cp .env.example .env      # then fill in the values you need
pnpm dev                  # http://localhost:3000
```

`.env` is not committed and never will be. Ask a maintainer for the values, or
pull them from Vercel. Deployed secrets live in Vercel environment variables.

Known issue: `pnpm install` can fail on Node 24 with
`FATAL ERROR: invalid array length`. Node 22 installs cleanly. CI runs Node 24.

### The five gates

CI runs these in this order, and rejects what you did not run yourself.

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `pnpm format:check` | Prettier, check only                       |
| `pnpm lint`         | ESLint, including the layer boundary rules |
| `pnpm typecheck`    | `tsc --noEmit`                             |
| `pnpm test`         | Vitest                                     |
| `pnpm build`        | Production build                           |

Also useful: `pnpm dev`, `pnpm test:watch`, `pnpm format`, and `npx knip` for
unused files and exports. `knip.json` lists the few entries it cannot see,
each with a reason.

---

## Where code goes

Every import points downward, and `pnpm lint` enforces it. Full detail is in
`docs/ARCHITECTURE.md`.

```
app/                routes and API route handlers. Composes features, owns no logic.
features/           one folder per product area, each owning its whole vertical.
components/ui/      design system primitives. Know nothing about any feature.
components/layout/  the app shell. The one place below app/ that may compose features.
hooks/              cross-cutting React hooks. Same layer as components/ui/.
lib/                pure cross-cutting: api client, money, format, brand.
```

Quick decisions:

- **A component used by one feature** goes in that feature, even if it feels
  generic.
- **A component used by three or more features, and which knows nothing about any
  of them,** goes in `components/ui/`.
- **A pure function with tests** goes in `lib/` if two or more features need it,
  otherwise in `features/<name>/lib/`.
- **A hook three or more features need** goes in `hooks/`. `lib/` stays
  framework-free, so a hook cannot live there.
- **Anything that calls an upstream service** goes through a route handler in
  `app/api/`, never straight from the browser.
- **Anything a route handler needs** goes in `lib/server/`, never in a feature.
  Importing a slice from a route handler drags client components into the server
  bundle.

Features never import each other, not even through the index. When one feature's
view has to show another's, the route passes it down: `app/(app)/dashboard` renders
`<PortfolioView crossBorderSlot={<CrossBorderBanner … />} />`. `pnpm lint` fails
on a cross-feature import, so this is not a matter of taste.

---

## Data and secrets

- A component never calls `fetch` directly and never holds a base URL. Use a
  hook, which uses a client in `lib/`, which calls our own `app/api/` route.
- Service URLs derive from `WSAPI_BASE_URL` through `wsapiService("<service>")`.
  Do not add a per-service environment variable for a new gateway service.
- API keys stay server side. If a key would end up in a `NEXT_PUBLIC_` variable,
  the design is wrong; put it behind a route handler instead.
- Validate upstream responses at the proxy boundary. Components only ever see
  our types.
- Never use floating point for asset amounts. Base units and `bigint`, converted
  once at the display edge.

---

## Testing

- Anything touching balances, amounts, decimals, or transaction building gets
  exact unit tests. This is not negotiable.
- Test behaviour, not implementation. A trade panel test covers the happy path,
  the validation failure, the API error, and the loading state.
- Put tests beside the code they cover, named after it: `presenter.ts` is
  covered by `presenter.test.ts` in the same folder. `__tests__/` is only for
  tests with no single subject, such as route handlers and smoke tests.
- Run the app and look at your change before you open a PR. Tests passing is not
  the same as the feature working.

---

## Branches and pull requests

`main` is the only long-lived branch. It is protected: no direct pushes,
including for admins, and only squash merges.

1. Branch off `main` with a clear prefix: `feat/`, `fix/`, `chore/`, `docs/`.
2. Keep the scope of the branch equal to the scope of the issue. One issue, one
   branch, one PR.
3. Commit atomically. One logical change per commit, with a message that says
   what changed and why. Do not add AI co-author trailers.
4. Before opening the PR, run all five gates locally: `pnpm format:check`,
   `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. CI runs the same
   five and will reject what you did not check.
5. Open the PR against `main` and fill in the template.
6. The `quality` check must pass. If the branch is behind `main`, update it and
   let the check run again.
7. Merge is a squash merge. The branch is deleted on merge.

### Reviewing

Every PR gets a Vercel preview deployment. **Open it.** Reading a diff is not
reviewing a UI change. For anything touching money, exercise the flow in the
preview before approving.

When you review, check the layering: a cross-feature import or a second
transport is a blocking comment, not a nit.

---

## Style

The full rules are in the engineering standards skill. The ones people get wrong
most often:

- Write every comment by hand, in plain English. Short, specific.
- A comment explains why, or a non-obvious what. Do not narrate code that already
  reads clearly.
- No em-dashes anywhere. Use a comma, a colon, or a period.
- No AI tone. No "robust", "seamlessly", "elegantly".
- Name things for what they are: `useSwapQuote`, not `useData`.
- No `any`, no `@ts-ignore`, no swallowed promise rejections. If something is
  hard, solve it.

### User-facing copy

- Say what happens, in the user's words. A person manages notifications, not
  webhook config.
- Errors explain what went wrong and what to do next. No apologies.
- New strings go in all five locale files: `en`, `de`, `es`, `fr`, `pt`. A
  missing key is a runtime error, and there is a test that catches the brand name
  hardcoded into a catalog.

---

## This Next.js is not the one you know

The repository runs a Next.js version with breaking changes against common
training data and against most tutorials. Two rules:

- Read the relevant guide in `node_modules/next/dist/docs/` before writing
  framework code. For example, `middleware.ts` is deprecated here in favour of
  `proxy.ts`.
- For any other library or SDK, check the current docs before coding against a
  remembered API.

---

## Getting help

- Architecture questions: `docs/ARCHITECTURE.md`, then ask in the team channel.
- Backend contracts: the gateway publishes OpenAPI at `/docs`, and each service
  at `/v1/<service>/openapi.json`.
- If something in these documents is wrong or out of date, fix it in the same PR
  as the work that revealed it.
