#!/usr/bin/env bash
# Tests for the runner-fallback add-on. Run from anywhere:
#   addons/runner-fallback/tests/run.sh
#
# These check the guard script against sample workflow files. They prove the
# guard flags the right lines. They do not run GitHub Actions, so they cannot
# prove how GitHub evaluates the expression itself.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
check="$here/../files/scripts/check-runner-fallback.sh"
fixtures="$here/fixtures"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

failures=0
pass() { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; failures=$((failures + 1)); }
expect() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

# Runs the guard on a directory holding only the named fixtures.
run_on() {
  local dir="$work/$1"; shift
  rm -rf "$dir"; mkdir -p "$dir"
  local f
  for f in "$@"; do cp "$fixtures/$f" "$dir/"; done
  "$check" "$dir" > "$work/out" 2>&1
  return $?
}

run_on one good.yml;               code=$?
expect "passes when every runs-on uses the fallback" "[[ $code -eq 0 ]]"
expect "prints a success message" "grep -q 'uses the runner fallback' '$work/out'"

run_on two bad-literal.yml;        code=$?
expect "fails on a hard-coded runner" "[[ $code -eq 1 ]]"
expect "names the file and the offending line" "grep -q 'bad-literal.yml,line=9' '$work/out'"
expect "does not flag the good job in the same file" "! grep -q 'line=5' '$work/out'"

run_on three bad-label.yml;        code=$?
expect "fails on a list of runner labels" "[[ $code -eq 1 ]]"

run_on four exempt.yml;            code=$?
expect "allows an exemption on the same line or the line above" "[[ $code -eq 0 ]]"

run_on five exempt-too-far.yml;    code=$?
expect "does not honour an exemption comment that is too far away" "[[ $code -eq 1 ]]"

run_on six good.yml bad-literal.yml; code=$?
expect "fails if any one file in the folder is bad" "[[ $code -eq 1 ]]"

empty="$work/empty"; mkdir -p "$empty"
"$check" "$empty" > /dev/null 2>&1
expect "fails when there are no workflow files" "[[ $? -eq 2 ]]"

"$check" "$work/missing" > /dev/null 2>&1
expect "fails when the directory does not exist" "[[ $? -eq 2 ]]"

echo
if (( failures > 0 )); then
  echo "$failures test(s) failed."
  exit 1
fi
echo "All runner-fallback tests passed."
