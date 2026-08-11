---
name: wsws-engineering-standards
description: Engineering standards for the Worldstreet (WSWS) frontend. Read before writing or reviewing any code, comment, or document in this repository.
---

# WSWS Frontend Engineering Standards

These are the rules for building the Worldstreet SuperApp frontend. They apply to every contributor, human or agent. Read them before you write code, comments, documentation, or commit messages. They are not suggestions.

## Architecture

`docs/ARCHITECTURE.md` holds the layer diagram, the structure, and the enforcement. Read it before adding a directory, a transport, or a shared component. The rules below are the parts that apply to every change.

- Four layers, and every import points downward: `app/` (routes and API route handlers) and `components/layout/` (the shell) to `features/` (one folder per product area) to `components/ui/` and `hooks/` (design system primitives and cross-cutting behaviour) to `lib/` (pure cross-cutting, framework-free). Nothing imports upward.
- Features never import each other, not even through the index. The route composes them, passing a slot, a callback, or a render prop. `pnpm lint` fails on a cross-feature import. If two slices keep reaching for each other, they are one feature; merge them rather than widening the surface.
- Anything a route handler needs lives in `lib/server/`. Importing a slice barrel into a route handler pulls client components into the server bundle, and no lint rule catches it.
- Shared building blocks belong below the feature line. Judge membership of `components/ui/` by whether the component knows anything about a feature, not by how many places import it. A `Switch` is a primitive even if used once. A ticker that understands casino wins is a feature component.
- `lib/` is for what two or more features need. If only one feature uses it, it lives in that feature.
- One transport. One `apiFetch`, one envelope unwrapper, one `ApiError`. Do not add a second client with its own base path and error text.
- Build modular. Every component, hook, and module has one job and a clear boundary. If a component renders UI and also fetches, normalizes, and caches data, split it. A component past roughly 300 lines is usually holding server state, derivation, and layout at once; extract the first two.
- Abstract at the seams, not everywhere. Define an interface where two tiers meet: UI to data layer, data layer to external API, wallet SDK to app code. Do not wrap code in layers that add no behavior.
- Dependencies point inward. Domain types and pure logic import nothing from the framework. Components depend on hooks, hooks depend on services, services depend on API clients. Never let a presentational component import an API client directly.
- Every market segment (Token, Perp, Prediction, NFT, Yield, RWA) follows the same four-pillar module template from the PRD: Execution panel, Portfolio view, Intelligence panel, Creation tooling. Build one segment, then copy its shape. A reviewer should not have to relearn the design per segment.
- External API payloads never reach components raw. Every upstream response is validated at the proxy boundary and mapped into our typed domain objects. Components only ever see our types.
- Every upstream call goes through a route handler in `app/api/`. The handler holds the secret, allowlists the path, and verifies the session. A component never calls `fetch` directly and never holds a base URL. If a key would end up in a `NEXT_PUBLIC_` variable, the design is wrong.
- Service URLs derive from `WSAPI_BASE_URL` through `wsapiService("<service>")`. Do not add a per-service environment variable for a new gateway service; the per-service variables that exist are local overrides only.
- Keep the same pattern across a tier. If one API adapter uses a given shape, every API adapter uses that shape.
- Server Components by default. Reach for `"use client"` only when the component needs interactivity, browser APIs, or client state, and push the boundary as deep into the tree as possible.
- Async work never blocks the UI. Long-running cross-chain or multi-API operations run behind loading and error states, never behind a frozen interface.

## This Next.js is not the one you know

- This repo runs a Next.js build with breaking changes against common training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any framework code. Heed deprecation notices.
- When working with any other library or SDK, check current docs first (Context7 MCP is available). Do not code against a remembered API.

## Correctness

- Verify each implementation before you move to the next one. Run the test, run the dev server, check the rendered output. Do not stack unverified work on top of unverified work.
- No shortcuts. If a thing is hard, solve it. Do not paper over a problem with a `@ts-ignore`, an `any`, a swallowed promise rejection, or a hardcoded value that hides the real path.
- No damage control. When something breaks, find the cause and fix it. Do not patch the symptom and move on.
- Handle errors where they happen. Surface them to the user in a useful state, log them with context. Never silence an error to make a test or a build pass.
- TypeScript strict mode stays on. No `any` unless a third-party boundary truly forces it, and then it is wrapped and typed at the seam.
- Write tests that prove the behavior, not tests that mirror the implementation. A swap panel test must cover the happy path, the validation failure, the API error state, and the loading state.
- This app moves money. Any code that touches balances, amounts, decimals, or transaction building gets exact tests. Never use floating point for asset amounts.

## Comments and naming

- Write every comment by hand, in plain English. Short, clear, and specific.
- No AI tone. Do not write filler like "this robust function elegantly handles". Say what the code does and why, then stop.
- Do not use em-dashes anywhere. Use a comma, a colon, or a period.
- A comment explains why, or explains a non-obvious what. Do not narrate code that already reads clearly.
- Name things for what they are. `useSwapQuote`, not `useData`. `PortfolioBalanceCard`, not `Card2`.

## Documentation

- Write docs the way a technical writer would. Technically correct, clear, and unambiguous.
- No jargon for its own sake. Define a term the first time you use it.
- Keep examples runnable. If a code sample is in the docs, it must compile and work.
- The README stays short and current. It documents the stack, the scripts, and the workflow. Deep material goes in dedicated docs.

## Git and review

- `CONTRIBUTING.md` is the practical workflow: setup, where code goes, and how a change reaches `main`. Point new contributors there first.
- One issue, one branch, one pull request. Keep the scope of a PR equal to the scope of its issue.
- Branch off `main`. Never push to `main` directly. Feature branches use a clear prefix: `feat/`, `fix/`, `chore/`.
- Open PRs against `main`. The `quality` CI check (format, lint, test, build) must pass before a PR can merge. `main` is the single long-lived branch and is protected: no direct pushes (admins included), and only squash merges are allowed.
- All merges are squash merges. The branch is deleted on merge.
- Every pull request gets a Vercel preview deployment. Open it. Reading a diff is not reviewing a UI change, and for anything touching money the flow gets exercised in the preview before approval.
- A cross-feature import, a second transport, or a new per-service environment variable is a blocking review comment, not a nit.
- Commits are atomic. One logical change per commit, with a message that says what changed and why.
- Never add AI co-author trailers to commits. Never commit or push on a contributor's behalf without being asked.
- Do not commit secrets. `.env` files stay out of git. Use Vercel environment variables for deployed secrets.

## Tooling

- pnpm only. Never npm or yarn. The version is pinned in `packageManager`.
- Run `pnpm format`, `pnpm lint`, `pnpm test`, and `pnpm build` before you open a pull request. CI runs the same four gates and will reject what you did not check.
- Use the pinned toolchain versions. Do not bump a dependency inside an unrelated change.
- When a task needs an MCP server that is available in the environment, use it. Check first, then use it.

## The bar

Build as a senior engineer who understands system architecture, core engineering principles, and problem solving. If a choice is between fast and correct, pick correct and explain the cost. Leave the codebase easier to work in than you found it.
