#!/usr/bin/env bash
# Fails unless the publish workflow's ONLY trigger is workflow_call.
#
# The whole release gate depends on that one fact. If the publish workflow
# gains a second trigger (a manual-run button, a push, a pull request),
# there is a way to publish that skips the approval, and nothing else in
# the repository would turn red to say so. This script is that alarm.
#
# Usage: scripts/check-publish-trigger.sh [path-to-workflow]
set -euo pipefail

file="${1:-.github/workflows/_publish.yml}"

if [[ ! -f "$file" ]]; then
  echo "::error::$file does not exist. The publish workflow must live at this path."
  exit 1
fi

# The inline forms "on: push" and "on: [push, workflow_call]" are refused
# outright: only the block form is accepted, so the check below stays simple.
if grep -Eq '^(on|"on"|'"'"'on'"'"'):[[:space:]]*[^[:space:]#]' "$file"; then
  echo "::error::$file must declare its trigger in block form: 'on:' on its own line, then '  workflow_call:'."
  exit 1
fi

# Collect the keys that sit exactly two spaces under "on:". Deeper keys
# (inputs, their fields) belong to workflow_call itself and are not triggers.
triggers="$(
  awk '
    /^(on|"on"|'"'"'on'"'"'):[[:space:]]*(#.*)?$/ { inside = 1; next }
    /^[^[:space:]#]/                             { inside = 0 }
    inside && /^  [A-Za-z_]+:/                   { sub(/^  /, ""); sub(/:.*/, ""); print }
  ' "$file"
)"

if [[ "$triggers" != "workflow_call" ]]; then
  found="$(echo "$triggers" | tr '\n' ' ')"
  echo "::error::$file must have ONLY 'workflow_call' as a trigger. Found: ${found:-none}"
  echo "::error::Any other trigger is a direct path to release credentials that skips the two-person approval."
  exit 1
fi

echo "$file has exactly one trigger: workflow_call. The publish gate is intact."
