#!/usr/bin/env bash
# Fails if a workflow job hard-codes its runner instead of using the fallback.
#
# Every `runs-on:` line must contain `vars.RUNNER_OS`, as in
#   runs-on: ${{ vars.RUNNER_OS || 'ubuntu-latest' }}
# so one repository variable can move every job to a different runner, and an
# unset variable falls back to a hosted one.
#
# A job that must run on a specific machine can opt out with a comment on the
# same line or on the line above:
#   # runner-fallback: exempt (why)
# Use that for jobs that exist to maintain one persistent machine. Such a job
# that followed the variable would run on a throwaway VM, report success, and
# never touch the machine it exists for.
#
# Usage: scripts/check-runner-fallback.sh [workflows-directory]
#   default directory: .github/workflows
set -euo pipefail

dir="${1:-.github/workflows}"

if [[ ! -d "$dir" ]]; then
  echo "::error::$dir does not exist."
  exit 2
fi

found=0
failed=0

for file in "$dir"/*.yml "$dir"/*.yaml; do
  [[ -e "$file" ]] || continue
  found=1
  if ! awk -v file="$file" '
    function exempt(line) { return line ~ /runner-fallback:[[:space:]]*exempt/ }
    /^[[:space:]]*runs-on:/ {
      if ($0 !~ /vars\.RUNNER_OS/ && !exempt($0) && !exempt(prev)) {
        printf "::error file=%s,line=%d::runs-on must use vars.RUNNER_OS with a fallback, or be marked \"# runner-fallback: exempt\": %s\n", file, NR, $0
        bad = 1
      }
    }
    { prev = $0 }
    END { exit bad }
  ' "$file"; then
    failed=1
  fi
done

if (( found == 0 )); then
  echo "::error::No workflow files found in $dir."
  exit 2
fi

if (( failed == 1 )); then
  exit 1
fi

echo "Every runs-on in $dir uses the runner fallback or is marked exempt."
