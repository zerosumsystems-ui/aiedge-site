#!/usr/bin/env bash
# Pre-push boundary check.
#
# AGENTS.md forbids prop-firm / funded-account / firm-rotation / payout-eval /
# account-management content on the AIedge public site. This hook intercepts
# `git push` to main and blocks the push if the pending diff contains those
# terms.
#
# Wired up as a PreToolUse Bash hook in .claude/settings.json. Exit 2 blocks
# the tool call and surfaces stderr to Claude.
set -u

input="$(cat)"

# Only act on bash commands that look like a push to main. Quick string check
# on the raw JSON — the JSON encoding does not escape these tokens.
if ! printf '%s' "$input" | grep -qE 'git[[:space:]]+push'; then
  exit 0
fi
if ! printf '%s' "$input" | grep -qE '(HEAD:main|[[:space:]\\"]main([[:space:]\\"]|$))'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$PWD}" || exit 0

git fetch origin main --quiet 2>/dev/null || true

files="$(git diff --name-only origin/main...HEAD 2>/dev/null \
  | grep -vE '^(AGENTS\.md|CLAUDE\.md|README(\.md)?|\.claude/)' || true)"

[ -z "$files" ] && exit 0

pattern='prop[-_ ]?firm|funded[-_ ]?account|firm[-_ ]rotation|payout[-_ ](eval|economics)|eval(uation)?[-_ ]economics|account[-_ ]rotation'

hits="$(printf '%s\n' "$files" | xargs -r -d '\n' grep -InE -i "$pattern" 2>/dev/null || true)"

if [ -n "$hits" ]; then
  cat >&2 <<EOF
[boundary] BLOCKED: AIedge product-boundary violation in pending push to main.

AGENTS.md forbids prop-firm / funded-account / firm-rotation / payout-eval /
account-management content on aiedge.trade. Matches:

$hits

Move this content out of the AIedge app before publishing.
EOF
  exit 2
fi

exit 0
