#!/usr/bin/env bash
# Tests for the aab-build add-on. Run from anywhere:
#   addons/aab-build/tests/run.sh
#
# The keystore tests use real keystores made with keytool, and are skipped when
# keytool is missing. The rest use Node's built-in test runner and a fake build
# runner. They need Node 20 or newer, and no network, credentials, Expo, Gradle
# or Android SDK. They do NOT build a real bundle.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
failed=0

if ! command -v node > /dev/null 2>&1; then
  echo "Node.js is required to run these tests."
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if (( node_major < 20 )); then
  echo "Node 20 or newer is required (found $(node --version))."
  exit 1
fi

echo "== keystore (real keytool)"
"$here/keystore.test.sh" || failed=1

echo
echo "== version code, signing patch and build steps (node)"
node --test "$here/aab-build.test.mjs" || failed=1

exit "$failed"
