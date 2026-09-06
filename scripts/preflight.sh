#!/usr/bin/env bash
set -euo pipefail

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Dynamically include node/pnpm paths if not on PATH
if ! command -v pnpm >/dev/null 2>&1; then
    NVM_LATEST=$(ls -d "$HOME/.nvm/versions/node"/v* 2>/dev/null | tail -n 1 || true)
    if [ -n "$NVM_LATEST" ]; then
        export PATH="$NVM_LATEST/bin:$NVM_LATEST/lib/node_modules/corepack/shims:$PATH"
    fi
    export PATH="$HOME/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:$PATH"
fi

SKIP_BUILD="${SKIP_BUILD:-false}"
if [ "${1:-}" = "--fast" ]; then
    SKIP_BUILD="true"
fi

echo -e "${BLUE}=== Starting Frontend Governance Preflight Checks ===${NC}"

echo -e "\n${BLUE}[1/5] Prettier Format Check...${NC}"
pnpm format:check

echo -e "\n${BLUE}[2/5] ESLint Quality Check...${NC}"
pnpm lint

echo -e "\n${BLUE}[3/5] TypeScript Type Check...${NC}"
pnpm typecheck

echo -e "\n${BLUE}[4/5] Vitest Suite...${NC}"
pnpm test

if [ "$SKIP_BUILD" = "true" ]; then
    echo -e "\n${BLUE}[5/5] Next.js Production Build (Skipped in fast pre-push mode)...${NC}"
else
    echo -e "\n${BLUE}[5/5] Next.js Production Build...${NC}"
    pnpm build
fi

echo -e "\n${GREEN}✓ All preflight gates passed successfully!${NC}"
