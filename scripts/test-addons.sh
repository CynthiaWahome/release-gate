#!/usr/bin/env bash
# Runs the tests of every add-on that has some: addons/*/tests/run.sh
#
# Usage: scripts/test-addons.sh
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
ran=0
failed=0

for runner in "$root"/addons/*/tests/run.sh; do
  [[ -e "$runner" ]] || continue
  name="$(basename "$(dirname "$(dirname "$runner")")")"
  echo "=== $name"
  ran=$((ran + 1))
  if ! "$runner"; then
    failed=$((failed + 1))
  fi
  echo
done

if (( ran == 0 )); then
  echo "No add-on tests found."
  exit 0
fi

if (( failed > 0 )); then
  echo "$failed of $ran add-on test suite(s) failed."
  exit 1
fi

echo "All $ran add-on test suite(s) passed."
