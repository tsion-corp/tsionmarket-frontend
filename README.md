# WSWS Frontend

The frontend for **Worldstreet**, a Web3 financial super app. Fiat on and off
ramps, spot markets, real-world assets, perpetuals, prediction markets, chess
wagering and yield, in one consumer-grade app that hides the chain from the
person using it.

This app moves real money. That fact sets the bar for everything in it.

## Requirements

- **Node 22 or 24.** CI runs 24. If `pnpm install` fails locally with
  `FATAL ERROR: invalid array length`, use Node 22.
- **pnpm**, pinned by `packageManager`. Do not use npm or yarn.

## Quick start

```bash
pnpm install
cp .env.example .env      # fill in the values you need
pnpm dev                  # http://localhost:3000
```

`.env` is never committed. Ask a maintainer for values, or pull them from
Vercel, where deployed secrets live.

## Scripts

| Command             | What it does                        |
| ------------------- | ----------------------------------- |
| `pnpm dev`          | Dev server                          |
| `pnpm build`        | Production build                    |
| `pnpm start`        | Serve the production build          |
| `pnpm format:check` | Prettier, check only                |
| `pnpm lint`         | ESLint, including boundary rules    |
| `pnpm typecheck`    | `tsc --noEmit`                      |
| `pnpm test`         | Vitest, once                        |
| `pnpm test:watch`   | Vitest, watch mode                  |
| `pnpm format`       | Prettier, write                     |
| `npx knip`          | Unused files, exports, dependencies |

The five gates from `format:check` to `build` are exactly what CI runs, in that
order. Run them before opening a pull request.

## Structure

```
app/          routes and BFF route handlers. Composes features, owns no logic.
features/     one folder per product area, each owning its whole vertical
components/   ui/ design system, layout/ the app shell
hooks/        cross-cutting React hooks
lib/          pure cross-cutting code: api client, money, format, brand
messages/     five locales: en, de, es, fr, pt
config/       chain registries
docs/         architecture and the restructure log
```

Nine feature slices: `activity`, `casino`, `earn`, `funds`, `portfolio`,
`prediction`, `remit`, `rwa`, `trade`.

Imports point downward: `app/` → `features/` → `components/ui/` and `hooks/` →
`lib/`. Features never import each other; the route composes them. This is
enforced by `eslint-plugin-boundaries`, so a violation fails `pnpm lint`.

## Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — read before your first change. Setup,
  where code goes, how work gets merged.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the shape of the codebase
  and why it is that shape. Read it before adding a directory, a transport, or a
  shared component.
- **[docs/RESTRUCTURE-LOG.md](docs/RESTRUCTURE-LOG.md)** — how it got that shape,
  and what each move taught. Useful when a boundary looks arbitrary.
- **`.claude/skills/wsws-engineering-standards/SKILL.md`** — the coding bar:
  correctness, comments, naming, testing.

## A warning about Next.js

This repository runs a Next.js version with breaking changes against most
tutorials and against what a language model is likely to remember. `middleware.ts`
is deprecated here in favour of `proxy.ts`, to name one. Read the relevant guide
in `node_modules/next/dist/docs/` before writing framework code.
