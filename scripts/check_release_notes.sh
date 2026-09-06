#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

# Dynamically include node/pnpm paths if not on PATH
if ! command -v pnpm >/dev/null 2>&1; then
    NVM_LATEST=$(ls -d "$HOME/.nvm/versions/node"/v* 2>/dev/null | tail -n 1 || true)
    if [ -n "$NVM_LATEST" ]; then
        export PATH="$NVM_LATEST/bin:$NVM_LATEST/lib/node_modules/corepack/shims:$PATH"
    fi
    export PATH="$HOME/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:$PATH"
fi

echo -e "${BLUE}=== Checking Release Notes Governance Gate ===${NC}"

# Determine base branch for comparison (default origin/main or HEAD~1)
TARGET_BRANCH="${TARGET_BRANCH:-origin/main}"

if git rev-parse --verify "$TARGET_BRANCH" >/dev/null 2>&1; then
    DIFF_BASE="$TARGET_BRANCH"
else
    DIFF_BASE="HEAD~1"
fi

# Check if application source code has changed
CHANGED_APP_FILES=$(git diff --name-only "$DIFF_BASE"...HEAD 2>/dev/null | grep -E '^(app|features|components|lib)/' || true)

if [ -z "$CHANGED_APP_FILES" ]; then
    echo -e "${GREEN}✓ No application code changes detected. Release notes gate passed.${NC}"
    exit 0
fi

# Check for newly added or modified release notes in active git diff
RELEASE_NOTES=$(git diff --name-only "$DIFF_BASE"...HEAD 2>/dev/null | grep -E '^docs/release-notes/.*\.md$' | grep -v '.gitkeep$' || true)

if [ -z "$RELEASE_NOTES" ]; then
    echo -e "${YELLOW}Warning: Application code changes detected, but no new release note was found in git diff for docs/release-notes/${NC}"
    echo -e "${YELLOW}Application files changed:${NC}"
    echo "$CHANGED_APP_FILES" | sed 's/^/  - /'
    echo -e "\n${YELLOW}Please add a release note markdown file under docs/release-notes/<date>-<feature>.md${NC}"
    if [ "${STRICT_RELEASE_NOTES:-false}" = "true" ]; then
        echo -e "${RED}❌ Release notes check failed in strict mode.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ Release note found in git diff (docs/release-notes/). Gate passed.${NC}"
fi
