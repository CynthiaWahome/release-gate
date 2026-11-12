#!/usr/bin/env bash
# Tests for the play-version-code add-on. Run from anywhere:
#   addons/play-version-code/tests/run.sh
#
# Uses Node's built-in test runner and a fake Google Play client. It needs
# Node 20 or newer, and no network access, credentials or npm packages.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node > /dev/null 2>&1; then
  echo "Node.js is required to run these tests."
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 20 )); then
  echo "Node 20 or newer is required (found $(node --version))."
  exit 1
fi

node --test "$here/get-play-version-code.test.mjs"
