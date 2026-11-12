#!/usr/bin/env bash
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
failed=0

if ! command -v node > /dev/null 2>&1; then
  echo "Node.js is required to run these tests."
  exit 1
fi

echo "== play-upload checks (node)"
node --test "$here/check-play-upload.test.mjs" || failed=1

exit "$failed"
