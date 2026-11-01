#!/usr/bin/env bash
# Fails when the PR description in $PR_BODY leaves .github/pull_request_template.md unfilled.
set -euo pipefail

template="$(dirname "$0")/../pull_request_template.md"
# Without this, a missing template would make "expected boxes" 0 and let every PR through.
[ -r "$template" ] || { echo "::error::Cannot read $template"; exit 1; }

# Drop the template's <!-- hints --> and Windows line endings before looking for content.
body=$(printf '%s' "${PR_BODY:-}" | tr -d '\r' | perl -0pe 's/<!--.*?-->//gs')
status=0

for heading in 'What' 'Why' 'How to test'; do
  text=$(awk -v h="## $heading" '{ sub(/[ \t]+$/, "") } $0 == h { on = 1; next } /^## / { on = 0 } on' <<<"$body" |
    tr -d '[:space:]')
  if [ -z "$text" ]; then
    echo "::error::Fill in the \"## $heading\" section of the PR description."
    status=1
  fi
done

# grep -c prints 0 but exits 1 on no match, which would trip `set -e`.
expected=$(grep -cE '^[[:space:]]*[-*] \[ \]' "$template" || true)
ticked=$(grep -ciE '^[[:space:]]*[-*] \[x\]' <<<"$body" || true)
unticked=$(grep -cE '^[[:space:]]*[-*] \[ \]' <<<"$body" || true)

# <<<, not `printf | grep -q`: grep -q exits at the first match, and printf then dies of SIGPIPE.
if ! grep -qE '^## Checklist[[:space:]]*$' <<<"$body"; then
  echo "::error::Keep the \"## Checklist\" section from the PR template."
  status=1
elif [ "$unticked" -gt 0 ]; then
  echo "::error::Tick every checklist box (add \"(n/a)\" to any that don't apply)."
  status=1
elif [ "$ticked" -lt "$expected" ]; then
  echo "::error::Keep all $expected checklist items from the PR template, ticked ($ticked found)."
  status=1
fi

exit "$status"
