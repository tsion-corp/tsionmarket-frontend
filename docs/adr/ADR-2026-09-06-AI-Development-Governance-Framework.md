# ADR-2026-09-06: AI Development Control, Quality Governance, and Production Safety Framework

## Status

Accepted — 2026-09-06

## Context

Integrating AI coding agents (such as Antigravity, Claude Code, Qwen Code, Codex, or custom LLM dev harnesses) into software engineering workflows drastically increases code generation velocity. However, unconstrained AI code generation introduces severe technical and operational risks:

1. **Rule Violations & Architectural Drift**: AI agents generating code without consulting architectural standards, changing global patterns, or introducing conflicting abstractions.
2. **Substandard & Untested Code**: Shipping untested code, masking errors with silent `try/catch` wrappers, or removing failing assertions.
3. **Broken Live Environments**: Shipping breaking migrations, unverified UI contracts, missing write-path validations, or untested cross-service dependencies directly to production.
4. **Self-Approving Changes**: AI agents declaring their own architectural plans valid without human oversight.

To enable high-velocity AI-assisted development without compromising production reliability, code quality, or system security, we require an **authoritative, end-to-end AI Governance and Control Framework** that is reusable across any project or technology stack.

---

## Decision

We establish the **7-Pillar AI Development Control & Production Safety Framework**. This governance model combines automated preflight intercepts, mandatory execution lifecycles, dark feature rollouts, scenario contracts, and adversarial review gates.

---

### Pillar 1: Canonical AI Rulebook (`AGENTS.md`)

Every repository adopting this framework MUST maintain a canonical instruction document (`AGENTS.md` in the root repository folder, symlinked or imported by vendor-specific files like `CLAUDE.md`, `GEMINI.md`, or `QWEN.md`).

#### Core Directives Enforced on AI Agents:

- **Read-Only Main Branch**: AI agents are forbidden from committing or pushing directly to `main` (or production branches). All work must occur in isolated Git worktrees (`git worktree add ...`).
- **Human Approval Gate (Phase 1 DECIDE)**: AI agents cannot proceed to implement non-trivial features or architectural shifts without authoring **TWO** Architectural Decision Records in `docs/adr/`: the technical ADR (`ADR-<date>-<topic>.md`) and the simplified companion ADR (`ADR-<date>-<topic>-for-dummies.md`), requiring **explicit human user approval**. An AI agent is strictly forbidden from approving its own ADR.
- **Red-Green Test-First Bug Fixing**: For any bug fix, the AI agent MUST write a failing regression test _first_, verify that it fails, and only then implement the fix.
- **No Masking or Swallow Errors**: AI agents are forbidden from fixing errors by wrapping calls in silent `try/catch`, commenting out failing tests, or returning dummy fallback data.

---

### Pillar 2: Multi-Stage Development Lifecycle (Phases 0–8)

All engineering work (whether human or AI-initiated) must follow a structured 9-step lifecycle:

```
[Phase 0: SYNC] ──► [Phase 1: DECIDE] ──► [Phase 2: PLAN]
                                                │
[Phase 5: BUILD] ◄── [Phase 4: RESERVE] ◄── [Phase 3: ISOLATE]
       │
       ▼
[Phase 6: VERIFY] ──► [Phase 7: DOCUMENT] ──► [Phase 8: DELIVER]
```

1. **0 SYNC**: Fetch `origin/main` ground truth. The local `main` branch must never be assumed current.
2. **1 DECIDE**: Author TWO companion ADRs in `docs/adr/` (`ADR-<date>-<topic>.md` and `ADR-<date>-<topic>-for-dummies.md`) and obtain **human approval**.
3. **2 PLAN**: Author an implementation plan (`docs/plans/<date>-<feature>-plan.md`) outlining scope, component boundaries, test strategy, and verified mockups.
4. **3 ISOLATE**: Cut a clean worktree branch off `origin/main`.
5. **4 RESERVE**: Reserve database migration timestamps using controlled generator scripts (if applicable) to prevent version collisions across concurrent branches.
6. **5 BUILD**: Write implementation code strictly paired with unit/integration tests (TDD).
7. **6 VERIFY**: Run preflight gates (`scripts/preflight.sh`) and validate changes end-to-end on local dev stack or browser before opening a PR.
8. **7 DOCUMENT**: Create a release note (`docs/release-notes/`), work log, user guide, and scenario impact declaration.
9. **8 DELIVER**: Submit Pull Request against `main` after passing mandatory pre-review quality audit.

---

### Pillar 3: Automated Local Preflight & Git Push Hooks (`preflight.sh`)

A Git pre-push hook (`.husky/pre-push`) automatically intercepts `git push` and invokes a root preflight dispatcher script (`scripts/preflight.sh`).

#### Strict Quality Gates Enforced:

- **Zero Linter/Compiler Warnings**: Compilers and linters must run with zero-tolerance warning policies (`eslint`, `tsc`, `prettier`).
- **Selective Sub-Project Dispatch**: Differentially compute changed files (`git diff --name-only origin/main...HEAD`) and run preflight checks for modified components to keep developer verification fast.
- **Shell Portability**: Preflight scripts must remain compatible with native macOS shells (Bash 3.2+) to prevent developer environment crashes.

---

### Pillar 4: Feature Flag Safety & Dark Feature Gating ("Platform Labs")

To prevent unverified AI code from breaking live user experiences:

- **Dark Merges by Default**: All new product features must merge behind feature flags with `master_state = 'off'`.
- **Governance Lints**: Automated scripts verify that configuration defaults leave features disabled upon deployment.
- **Backend Evaluation Point**: Feature flag checks are enforced at the API/service layer. Hiding UI elements alone is not considered enforcement.
- **Instant Production Kill-Switch**: If a bug occurs post-deployment, the feature flag can be toggled off instantly in production without code rollbacks.

---

### Pillar 5: Protected Trunk & Deployment Controls

- **Protected `main` Branch**: Direct pushing to `main` is blocked by GitHub repository rulesets. Code enters `main` only via Pull Requests, required CI checks (`gate`), and review approvals.
- **Sandbox-First Deployment**: Merging to `main` automatically deploys code to Sandbox (non-production) environment.
- **Production Canary Deployments**: Production promotion requires explicit human environment approvals and health monitoring.

---

### Pillar 6: Scenario-Based End-to-End Verification & Release Gating

- **Scenario Impact Declarations**: Every governed code change must declare its impact in release note frontmatter (`scenario-impact: updated | needs_automation | none`).
- **Executable Scenario Contracts**: User-facing feature changes require executable end-to-end scenario definitions (`schema_version: 1` YAML contracts) or gap files.
- **Release Note CI Gate**: Automated scripts (`scripts/check_release_notes.sh`) block PR merges unless structured release notes with verification proof are provided.

---

### Pillar 7: Recurring Defect Audit Checklist (Mandatory Pre-Review Self-Audit)

Before submitting any PR for review, AI agents and developers MUST self-audit code against catalogued recurring defect classes:

1. **Proxy Boundary Validation & Typing**: External API payloads validated at proxy handlers (`app/api/`) and mapped to domain types.
2. **Wiring Tests Over Mechanism Tests**: Unit/integration tests cover route handlers, error states, and UI flows.
3. **Test-First Fixes**: Bug fixes locked with a failing test _before_ editing production code.
4. **Decimal & Asset Precision**: Monetary values use `bigint` / base units (no floating-point).
5. **UI Loading & Error States**: Explicit loading states and error handling without frozen UIs.
6. **Locale Completeness**: All 5 locale catalogs (`en`, `de`, `es`, `fr`, `pt`) updated simultaneously.
7. **Strict Architectural Layering**: Downward imports only (`app` -> `features` -> `ui`/`hooks` -> `lib`). No cross-feature imports.
8. **Preflight Verification**: Clean pass on `./scripts/preflight.sh`.
