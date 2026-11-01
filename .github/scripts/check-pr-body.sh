#!/usr/bin/env bash
# Fails when the PR description in $PR_BODY leaves .github/pull_request_template.md unfilled.
set -euo pipefail

# Drop the template's <!-- hints --> and Windows line endings before looking for content.
body=$(printf '%s' "${PR_BODY:-}" | tr -d '\r' | perl -0pe 's/<!--.*?-->//gs')
status=0

for heading in 'What' 'Why' 'How to test'; do
  text=$(printf '%s\n' "$body" |
    awk -v h="## $heading" '{ sub(/[ \t]+$/, "") } $0 == h { on = 1; next } /^## / { on = 0 } on' |
    tr -d '[:space:]')
  if [ -z "$text" ]; then
    echo "::error::Fill in the \"## $heading\" section of the PR description."
    status=1
  fi
done

if ! printf '%s\n' "$body" | grep -qE '^## Checklist[[:space:]]*$'; then
  echo "::error::Keep the \"## Checklist\" section from the PR template."
  status=1
elif printf '%s\n' "$body" | grep -qE '^[[:space:]]*[-*] \[ \]'; then
  echo "::error::Tick every checklist box (add \"(n/a)\" to any that don't apply)."
  status=1
fi

exit "$status"
