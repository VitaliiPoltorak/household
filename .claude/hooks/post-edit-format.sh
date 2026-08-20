#!/usr/bin/env bash
# PostToolUse hook (matcher: Write|Edit).
# Runs prettier --write + eslint --fix on TS/JS files after an edit.
# Advisory: failures never block the agent (PostToolUse can't undo edits).
#
# Not wired into settings.json yet — enable by adding to hooks.PostToolUse.

set -uo pipefail

payload="$(cat)"
file_path="$(printf '%s' "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))')"

case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0;;
esac

[[ -f "$file_path" ]] || exit 0

dir="$(dirname "$file_path")"
repo_root="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$repo_root" ]] || exit 0

cd "$repo_root"
pnpm exec prettier --write "$file_path" >/dev/null 2>&1 || true
pnpm exec eslint --fix "$file_path"     >/dev/null 2>&1 || true

exit 0
