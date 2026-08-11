#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Run AFTER commit-port-prs.sh, so the comments can point at landed work.

gh pr comment 187 --body "Ported onto \`refactor/architecture\` rather than merged, because this branch restructures the tree and the PR targets the old layout. The change itself is unchanged and your authorship is preserved on the commit.

Closing as superseded."
gh pr close 187

gh pr comment 189 --body "Ported onto \`refactor/architecture\` rather than merged. That branch moves every casino file into \`features/casino/\`, so this PR could not merge without conflicts across all 41 files. Your authorship is preserved on the commit.

The feature is unchanged. What moved: \`draughts/\` components and lib into the casino slice, \`use-draughts-match\` into the slice's hooks, and the two draughts tests colocated beside their subjects. Three things needed adapting to code that changed after you branched:

- \`draughts-client\` now binds to \`createServiceClient\` like \`chess-client\`, keeping its exported names. The hand-rolled transport was collapsed into one client.
- its envelope import points at \`lib/api/envelope\`; the \`lib/casino/api/envelope\` alias is gone.
- the five checkers pages dropped \`hideFooter\`, since the dashboard footer was removed.

\`docs/backend/draughts-spectator-betting.md\` is not included, matching a decision to keep gateway contracts out of \`docs/\`. It stays on this branch if you need it.

Closing as superseded."
gh pr close 189

gh pr comment 166 --body "Closing without merging. The in-house voice pipeline this builds on has been removed: \`use-vivid-session\`, \`use-voice-session\`, \`lib/voice/vivid-intent\` and \`app/api/tts\` are all deleted.

The assistant itself is still live, but it is the external Vivid widget loaded in \`app/layout.tsx\`, with \`VividWidgetDock\` positioning it. The in-house recorder and orb were that widget's predecessor and had been commented out in \`app/providers.tsx\` rather than removed.

If streaming capture is still wanted, it would target the widget instead, so this would need rewriting rather than rebasing. The work is preserved on the branch."
gh pr close 166

gh pr comment 161 --body "Closing without merging. \`PREDICTION_INTEGRATION_TODO.md\` has been retired: every step in the v1.2.0 guide shipped in #183, it carried no open items, and each path it named had moved with the restructure, so it could only mislead.

The guide is preserved on this branch and in history if the contract needs checking again."
gh pr close 161

echo
gh pr list --state open --limit 20
