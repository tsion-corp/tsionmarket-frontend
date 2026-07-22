# WSWS Frontend — Worldstreet Web3 SuperApp

The frontend for **Worldstreet**, a unified Web3 financial SuperApp. It brings fiat on/off-ramps, crypto spot markets, decentralized trading, Real-World Assets (RWAs), perps, prediction markets, and automated yield into a single, consumer-grade experience — abstracting blockchain complexity so everyday users can earn, save, invest, trade, and move value without depending on centralized gatekeepers.

## Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org) (App Router, Turbopack) + React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Testing:** Vitest + React Testing Library
- **Tooling:** ESLint (`eslint-config-next`), Prettier
- **Package manager:** pnpm (pinned via `packageManager`)
- **Deploy target:** Vercel

## Getting Started

Requires **Node.js 24+** and **pnpm 10+**.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app. Edit `app/page.tsx` to start — the page hot-reloads on save.

## Scripts

| Command             | Description                                |
| ------------------- | ------------------------------------------ |
| `pnpm dev`          | Start the dev server (Turbopack)           |
| `pnpm build`        | Production build                           |
| `pnpm start`        | Serve the production build                 |
| `pnpm lint`         | Run ESLint                                 |
| `pnpm test`         | Run the Vitest suite once                  |
| `pnpm test:watch`   | Run Vitest in watch mode                   |
| `pnpm format`       | Format the codebase with Prettier          |
| `pnpm format:check` | Check formatting without writing (CI gate) |

## Branching & Contribution Workflow

We use a **two-branch model**:

- **`main`** — production / deploy branch. Protected.
- **`dev`** — integration branch. All feature work merges here first. Protected.

**Flow:**

1. Branch off `dev`: `git switch dev && git pull && git switch -c feat/your-feature`
2. Commit your work and push: `git push -u origin feat/your-feature`
3. Open a PR **into `dev`**. CI (`quality`) must pass before merge.
4. PRs are **squash-merged** — one clean commit per feature. The branch is auto-deleted after merge.
5. When `dev` is release-ready, the lead opens a PR from `dev` → `main` for deployment.

**Rules enforced by branch protection:**

- No direct pushes to `dev` or `main` — a PR is always required.
- The `quality` CI check (format → lint → test → build) must pass.
- Branches must be up to date with the base before merging.
- Linear history (squash-only merges repo-wide).

## Continuous Integration

`.github/workflows/ci.yml` runs on every PR (and push) to `dev` and `main`. The single `quality` job runs, in order:

1. `pnpm format:check` — Prettier
2. `pnpm lint` — ESLint
3. `pnpm test` — Vitest
4. `pnpm build` — Next.js production build

All four must pass for the PR to be mergeable.

## Project Structure

```
app/                 # Next.js App Router (routes, layouts, pages)
public/              # Static assets
__tests__/           # Vitest test suites
.github/workflows/   # CI pipelines
AGENTS.md            # Notes for AI coding agents (read before editing)
```

> **Note:** This repo runs a build of Next.js with breaking changes vs. common training data. See `AGENTS.md` and the guides in `node_modules/next/dist/docs/` before writing framework code.
