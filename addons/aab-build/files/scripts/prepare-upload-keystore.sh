#!/usr/bin/env bash
# Writes the Android upload keystore to disk and checks it is the right one.
#
# The keystore arrives as a base64 secret. This decodes it to the path you give,
# then compares the key's SHA1 fingerprint with the one you expect. Google Play
# rejects a bundle signed with a key it does not know, and finding that out
# after a 20-minute build is a poor way to learn the wrong secret was used.
#
# Usage: scripts/prepare-upload-keystore.sh <output-path>
#
# Environment (all required):
#   ANDROID_UPLOAD_KEYSTORE_BASE64  the keystore file, base64-encoded
#   ANDROID_UPLOAD_STORE_PASSWORD   the keystore password
#   ANDROID_UPLOAD_KEY_ALIAS        the key alias inside it
#   ANDROID_UPLOAD_SHA1             the expected SHA1 fingerprint. Case, colons
#                                   and spaces do not matter. Get it from Play
#                                   Console (app signing) or `keytool -list -v`.
#
# The password is handed to keytool through the environment, never on the
# command line, so it does not show up in the process list. On any failure the
# decoded keystore is deleted. Exit codes: 0 ok, 1 wrong key or unreadable
# keystore, 2 missing input.
set -euo pipefail

if [[ $# -ne 1 || -z "${1:-}" ]]; then
  echo "Usage: scripts/prepare-upload-keystore.sh <output-path>" >&2
  exit 2
fi
output_path="$1"

for name in ANDROID_UPLOAD_KEYSTORE_BASE64 ANDROID_UPLOAD_STORE_PASSWORD ANDROID_UPLOAD_KEY_ALIAS ANDROID_UPLOAD_SHA1; do
  if [[ -z "${!name:-}" ]]; then
    echo "::error::$name is required." >&2
    exit 2
  fi
done

if ! command -v keytool > /dev/null 2>&1; then
  echo "::error::keytool was not found. Install a JDK first (for example with actions/setup-java)." >&2
  exit 2
fi

cleanup_on_failure() {
  rm -f "$output_path"
}
trap cleanup_on_failure ERR

# Only the owner may read the key file.
umask 077
mkdir -p "$(dirname "$output_path")"

if ! printf '%s' "$ANDROID_UPLOAD_KEYSTORE_BASE64" | base64 --decode > "$output_path" 2> /dev/null; then
  rm -f "$output_path"
  echo "::error::ANDROID_UPLOAD_KEYSTORE_BASE64 is not valid base64." >&2
  exit 1
fi

if [[ ! -s "$output_path" ]]; then
  rm -f "$output_path"
  echo "::error::ANDROID_UPLOAD_KEYSTORE_BASE64 decoded to an empty file." >&2
  exit 1
fi

if ! keytool_output="$(keytool -list -v \
  -keystore "$output_path" \
  -storepass:env ANDROID_UPLOAD_STORE_PASSWORD \
  -alias "$ANDROID_UPLOAD_KEY_ALIAS" 2>&1)"; then
  rm -f "$output_path"
  echo "::error::keytool could not read the keystore. The file, the password or the alias is wrong." >&2
  exit 1
fi

normalize() { tr -d ': \t\r' <<< "$1" | tr '[:lower:]' '[:upper:]'; }

actual_sha1="$(grep -m1 -E '^[[:space:]]*SHA1:' <<< "$keytool_output" | sed 's/^[[:space:]]*SHA1:[[:space:]]*//' || true)"
if [[ -z "$actual_sha1" ]]; then
  rm -f "$output_path"
  echo "::error::keytool did not report a SHA1 fingerprint for alias '$ANDROID_UPLOAD_KEY_ALIAS'." >&2
  exit 1
fi

if [[ "$(normalize "$actual_sha1")" != "$(normalize "$ANDROID_UPLOAD_SHA1")" ]]; then
  rm -f "$output_path"
  echo "::error::The upload key SHA1 does not match the expected SHA1." >&2
  echo "::error::Expected: $ANDROID_UPLOAD_SHA1" >&2
  echo "::error::Found:    $actual_sha1" >&2
  exit 1
fi

trap - ERR
echo "Upload key fingerprint matches the expected SHA1. Keystore written to $output_path"
