#!/usr/bin/env bash
# PreToolUse hook (matcher: Edit|Write).
# Blocks edits to control-plane files: .claude/, real .env* secrets,
# CI workflows, .git internals, Postman collections (seed creds),
# and TypeORM migrations (frozen while Phase 3 stabilises).
#
# Not wired into settings.json yet — enable by adding to hooks.PreToolUse.
# Exit 0 = allow. Exit 2 = block (stderr surfaced to the model).

set -euo pipefail

payload="$(cat)"
file_path="$(printf '%s' "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))')"

# Empty file_path means the tool call wasn't Edit/Write with a path — allow.
[[ -n "$file_path" ]] || exit 0

# Normalize to a repo-relative path. Walk up from the file to find an
# existing directory (the file may not exist yet on Write), then ask git
# for the repo root. Fall back to $PWD if git can't tell us.
dir="$(dirname "$file_path")"
while [[ -n "$dir" && "$dir" != "/" && ! -d "$dir" ]]; do
  dir="$(dirname "$dir")"
done
repo_root="$(git -C "${dir:-$PWD}" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  repo_root="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null || true)"
fi
if [[ -n "$repo_root" && "$file_path" == "$repo_root"/* ]]; then
  rel="${file_path#"$repo_root"/}"
else
  rel="$file_path"
fi

# TypeORM migrations at any depth under apps/<svc>/src (bash case can't recurse).
if [[ "$rel" =~ ^apps/[^/]+/src/(.*/)?migrations/ ]]; then
  reason="TypeORM migrations are frozen while Phase 3 stabilises (see CLAUDE.md)"
  echo "protect-control-plane: refused to edit '$rel' — $reason" >&2
  exit 2
fi

case "$rel" in
  .claude/*|*/.claude/*)
    reason=".claude/ is the harness control plane";;
  .env|.env.local|.env.production|*/.env|*/.env.local|*/.env.production)
    reason="secret .env file — humans only (.env.example / .env.test are fine)";;
  .github/workflows/*|*/.github/workflows/*)
    reason="CI workflows require human review";;
  .git/*|*/.git/*)
    reason=".git/ is not user-editable";;
  docs/postman/*.json|*/docs/postman/*.json)
    reason="Postman collections may hold seed credentials";;
  *)
    exit 0;;
esac

echo "protect-control-plane: refused to edit '$rel' — $reason" >&2
exit 2
