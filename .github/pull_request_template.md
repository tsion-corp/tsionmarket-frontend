## Summary

<!-- What does this PR do? Which product area does it touch? -->

## Scenario Impact Declaration

- [ ] **scenario-impact**: `updated` | `needs_automation` | `none`
- [ ] Added release note in `docs/release-notes/<date>-<feature>.md` (required for UI/app code changes)

## Related

<!-- Link issues/tickets, e.g. Closes #123 -->

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor / chore
- [ ] Docs

## Governance & Pre-Review Checklist

- [ ] **Worktree Isolation**: Work was completed in an isolated branch/worktree (not pushed to `main`).
- [ ] **Human Approval**: ADR/Plan approved by human maintainer (if non-trivial change).
- [ ] **Proxy Boundary Validation**: Upstream API payloads validated & mapped to domain types at proxy (`app/api/`).
- [ ] **Wiring Tests**: Unit/Integration tests cover route handlers and UI states (not just helper mocks).
- [ ] **Test-First Fix**: Bug fix was preceded by a failing regression test.
- [ ] **Decimal & Money Precision**: Money/token values use `bigint` / base units (no floating-point).
- [ ] **UI Loading & Error States**: Async actions handle loading/error states without freezing UI.
- [ ] **Locale Completeness**: User-facing strings added to all 5 locale files (`en`, `de`, `es`, `fr`, `pt`).
- [ ] **Layering Boundaries**: Pure downward imports (`app` -> `features` -> `ui`/`hooks` -> `lib`). No cross-feature imports.
- [ ] **Preflight Gate**: `./scripts/preflight.sh` ran locally and passed with zero errors/warnings.
- [ ] **Preview Verification**: Opened Vercel preview deployment and exercised flow manually.

## How this was verified

<!-- What you ran or clicked. For money paths, say which flow you completed. -->

## Screenshots / notes

<!-- UI changes, edge cases considered -->
