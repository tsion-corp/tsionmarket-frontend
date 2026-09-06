<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any framework code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Engineering Standards & AI Governance Rulebook

All AI coding agents (Antigravity, Claude Code, Qwen Code, Codex, and custom LLM dev harnesses) operating in this repository MUST strictly abide by the rules, architectural layerings, and lifecycle procedures established in this document and in `.claude/skills/wsws-engineering-standards/SKILL.md`.

---

## Core Mandatory AI Governance Directives

### Directive 1: Read-Only Main Branch & Mandatory Worktree Isolation

Direct commits or pushes to the `main` branch are strictly forbidden for all AI agents. All feature development, refactoring, and bug fixing MUST be conducted in isolated Git worktrees created off `origin/main` using `git worktree add`. AI agents must never assume local `main` is current without explicitly syncing ground truth.

### Directive 2: Human Approval Gate (Phase 1 DECIDE)

AI agents are strictly prohibited from implementing non-trivial features, architectural changes, or framework modifications without authoring **TWO** Architectural Decision Records under `docs/adr/`:

1. **Technical ADR (`docs/adr/ADR-<YYYY-MM-DD>-<topic>.md`)**: Fully detailed technical specification covering context, architectural impacts, trade-offs, and visual component diagrams.
2. **Simplified Companion ADR ("ADR for Dummies") (`docs/adr/ADR-<YYYY-MM-DD>-<topic>-for-dummies.md`)**: Accessible, plain-English breakdown of the context, core decision, and impact for non-technical stakeholders.

- **An AI agent is strictly forbidden from approving its own ADRs or implementation plan.**
- Execution MUST NOT begin until explicit, unambiguous human user approval is granted on both ADR documents.

### Directive 3: Red-Green Test-First Bug Fixing Protocol

When addressing any bug, regression, or defect, the AI agent MUST strictly follow the Red-Green Test-First sequence:

1. **Red Phase**: Write a failing unit or integration test that explicitly reproduces the reported defect. Run the test suite and confirm that the test fails for the exact reason identified.
2. **Green Phase**: Implement the minimal required production code fix to make the failing test pass. Re-run the test suite and confirm clean passage without introducing secondary regressions.

### Directive 4: Prohibition of Error Swallowing & Symptom Masking

AI agents are forbidden from resolving build errors, type errors, or test failures through symptom masking or error swallowing. Specifically:

- Do NOT wrap failing operations in silent `try/catch` blocks or empty catch handlers.
- Do NOT bypass type checks using `@ts-ignore`, `@ts-nocheck`, or loose `any` casts.
- Do NOT return dummy, empty, or fallback objects to hide missing data or broken upstreams.
- Do NOT comment out or delete failing assertions or broken test cases.

### Directive 5: Local Preflight Verification Enforcement

Before submitting any Pull Request or marking a task complete, the AI agent MUST execute the root preflight dispatcher script (`scripts/preflight.sh`). All five quality gates (formatting, linting, typechecking, Vitest suite, Next.js production build) must complete cleanly with zero warnings or errors.

---

## Multi-Stage Development Lifecycle (Phases 0–8)

All engineering tasks undertaken by AI agents must strictly proceed through the following 9-phase lifecycle:

```
[Phase 0: SYNC] ──► [Phase 1: DECIDE] ──► [Phase 2: PLAN]
                                                │
[Phase 5: BUILD] ◄────────────── [Phase 3: ISOLATE]
       │
       ▼
[Phase 6: VERIFY] ──► [Phase 7: DOCUMENT] ──► [Phase 8: DELIVER]
```

### Phase 0: SYNC (Ground Truth Synchronization)

Execute `git fetch origin main` to pull latest upstream changes. Never rely on potentially stale local branch refs.

### Phase 1: DECIDE (Architectural Decision Record & Human Approval)

For non-trivial features or structural refactors, author TWO companion ADR documents under `docs/adr/`:

1. `docs/adr/ADR-<YYYY-MM-DD>-<topic>.md` (Technical specification with component diagrams).
2. `docs/adr/ADR-<YYYY-MM-DD>-<topic>-for-dummies.md` (Plain-English summary for non-technical stakeholders).

Present both ADRs to the human maintainer and pause execution until explicit human approval is received.

### Phase 2: PLAN (Technical Implementation Planning)

Draft a detailed implementation plan under `docs/plans/<date>-<feature>-plan.md` defining component boundaries, interface contracts, state changes, test strategy, and UI mockups.

### Phase 3: ISOLATE (Worktree Branch Creation)

Create a clean, isolated Git worktree off `origin/main` using `git worktree add .worktrees/<branch-name> -b <branch-name>`.

### Phase 5: BUILD (Test-Driven Implementation)

Construct implementation code paired strictly with unit and integration tests (TDD). Maintain strict compliance with architectural layering boundaries (`app/` -> `features/` -> `components/ui/` / `hooks/` -> `lib/`).

### Phase 6: VERIFY (Local Preflight & Interactive Validation)

Execute `./scripts/preflight.sh` to run the full quality suite locally. Open the Vercel preview deployment or local dev server to manually exercise the interactive UI flow and verify edge cases.

### Phase 7: DOCUMENT (Release Notes & Scenario Declarations)

Create a dedicated release note file under `docs/release-notes/<date>-<feature>.md` containing structured metadata and a scenario impact declaration (`scenario-impact: updated | needs_automation | none`).

### Phase 8: DELIVER (Pull Request & Review Submission)

Submit the Pull Request against `main` using `.github/pull_request_template.md`. Ensure all CI automated status checks pass.

---

## Mandatory Pre-Review Defect Audit Checklist (Frontend)

Before requesting review or submitting a PR, AI agents MUST perform a thorough self-audit against these 8 defect classes:

1. **Proxy Boundary Validation & Typing**:
   - All external upstream API payloads must be validated at the proxy route handler (`app/api/`) using Zod or domain parsers and mapped into internal domain types.
   - Raw upstream JSON objects must never be passed directly to presentational components.

2. **Wiring Tests Over Mechanism Tests**:
   - Unit and integration tests must cover actual route handlers, API unwrappers, and component error boundaries rather than relying solely on isolated helper function unit tests.

3. **Test-First Fix Verification**:
   - Confirm that any bug fix was locked with a failing regression test _before_ production code edits were made.

4. **Decimal & Asset Precision**:
   - Floating-point numbers (`number`) must NEVER be used for asset amounts, wallet balances, or trade calculations.
   - All monetary arithmetic must use base units and standard `bigint` representation, converted only at the visual display formatting edge.

5. **UI Loading & Error State Completeness**:
   - Asynchronous operations, network fetches, and wallet interactions must display explicit loading states (skeletons or spinners) and handle error states gracefully (toasts or inline banners). No frozen UIs or unhandled promise rejections are permitted.

6. **Locale Completeness**:
   - All new user-facing strings must be added simultaneously across all five supported locale translation catalogs: `en`, `de`, `es`, `fr`, and `pt`.

7. **Strict Architectural Layering**:
   - Every import MUST point downward (`app/` -> `features/` -> `components/ui/`, `hooks/` -> `lib/`).
   - Features must never import other features (no cross-feature imports).
   - Presentational components must never call `fetch` directly or consume gateway base URLs.
   - Gateway service URLs must derive from `WSAPI_BASE_URL` using `wsapiService("<service>")`; do not introduce per-service environment variables.

8. **Preflight Verification**:
   - Verify that `./scripts/preflight.sh` completes cleanly with zero errors and zero warnings across formatting, linting, typechecking, Vitest tests, and Next.js production build.
