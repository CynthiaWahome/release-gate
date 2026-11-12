#!/usr/bin/env bash
# Tests for prepare-upload-keystore.sh using REAL keystores made with keytool.
# Nothing here is faked: the script decodes, reads and fingerprints a genuine
# Java keystore, so the SHA1 comparison is checked against what keytool reports.
#
# Skips (exit 0 with a notice) when keytool is not installed.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../files/scripts/prepare-upload-keystore.sh"

if ! command -v keytool > /dev/null 2>&1; then
  echo "keytool not found: skipping the keystore tests."
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

failures=0
pass() { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; failures=$((failures + 1)); }
expect() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

PASSWORD="test-password-123"
ALIAS_NAME="upload"

make_keystore() {
  keytool -genkeypair -keystore "$1" -storepass "$PASSWORD" -keypass "$PASSWORD" \
    -alias "$ALIAS_NAME" -keyalg RSA -keysize 2048 -validity 30 \
    -dname "CN=Test, OU=Test, O=Test, C=US" > /dev/null 2>&1
}

sha1_of() {
  keytool -list -v -keystore "$1" -storepass "$PASSWORD" -alias "$ALIAS_NAME" 2> /dev/null \
    | grep -m1 -E '^[[:space:]]*SHA1:' | sed 's/^[[:space:]]*SHA1:[[:space:]]*//'
}

make_keystore "$work/good.jks"
make_keystore "$work/other.jks"
good_b64="$(base64 < "$work/good.jks" | tr -d '\n')"
good_sha1="$(sha1_of "$work/good.jks")"
other_sha1="$(sha1_of "$work/other.jks")"

expect "the two test keystores have different fingerprints" "[[ -n '$good_sha1' && '$good_sha1' != '$other_sha1' ]]"

run_script() {
  # run_script <out> <b64> <password> <alias> <sha1>
  ANDROID_UPLOAD_KEYSTORE_BASE64="$2" ANDROID_UPLOAD_STORE_PASSWORD="$3" \
    ANDROID_UPLOAD_KEY_ALIAS="$4" ANDROID_UPLOAD_SHA1="$5" \
    "$script" "$1" > "$work/stdout" 2> "$work/stderr"
}

echo "== matching key"
out="$work/out1/key.jks"
run_script "$out" "$good_b64" "$PASSWORD" "$ALIAS_NAME" "$good_sha1"; code=$?
expect "exits 0 when the fingerprint matches" "[[ $code -eq 0 ]]"
expect "writes the keystore file" "[[ -s '$out' ]]"
expect "the written file is byte-identical to the original" "cmp -s '$out' '$work/good.jks'"
expect "the keystore is readable only by its owner" "[[ \"\$(stat -f %Lp '$out' 2>/dev/null || stat -c %a '$out')\" == 600 ]]"
expect "never prints the password" "! grep -q '$PASSWORD' '$work/stdout' '$work/stderr'"

lower="$(tr '[:upper:]' '[:lower:]' <<< "$good_sha1" | tr -d ':')"
run_script "$work/out2/key.jks" "$good_b64" "$PASSWORD" "$ALIAS_NAME" "$lower"; code=$?
expect "accepts the fingerprint in lower case without colons" "[[ $code -eq 0 ]]"

spaced="$(sed 's/:/ : /g' <<< "$good_sha1")"
run_script "$work/out3/key.jks" "$good_b64" "$PASSWORD" "$ALIAS_NAME" "$spaced"; code=$?
expect "accepts a fingerprint with spaces around the colons" "[[ $code -eq 0 ]]"

echo "== password handling"
real_keytool="$(command -v keytool)"
shim="$work/shim"; mkdir -p "$shim"
cat > "$shim/keytool" <<SHIM
#!/usr/bin/env bash
printf '%s\\n' "\$@" >> "$work/keytool-args"
exec "$real_keytool" "\$@"
SHIM
chmod +x "$shim/keytool"
: > "$work/keytool-args"
PATH="$shim:$PATH" run_script "$work/out-args/key.jks" "$good_b64" "$PASSWORD" "$ALIAS_NAME" "$good_sha1"; code=$?
expect "the shimmed keytool still accepts the matching key" "[[ $code -eq 0 ]]"
expect "keytool was actually called through the shim" "[[ -s '$work/keytool-args' ]]"
expect "the password is never passed to keytool as an argument" "! grep -q -- '$PASSWORD' '$work/keytool-args'"
expect "keytool is told to read the password from the environment" "grep -q -- '-storepass:env' '$work/keytool-args'"

echo "== wrong key"
out="$work/out4/key.jks"
run_script "$out" "$good_b64" "$PASSWORD" "$ALIAS_NAME" "$other_sha1"; code=$?
expect "exits 1 when the fingerprint does not match" "[[ $code -eq 1 ]]"
expect "deletes the decoded keystore" "[[ ! -e '$out' ]]"
expect "reports expected and found fingerprints" "grep -q 'Expected:' '$work/stderr' && grep -q 'Found:' '$work/stderr'"

echo "== unreadable keystore"
out="$work/out5/key.jks"
run_script "$out" "$good_b64" "wrong-password" "$ALIAS_NAME" "$good_sha1"; code=$?
expect "exits 1 for a wrong password" "[[ $code -eq 1 ]]"
expect "deletes the keystore after a wrong password" "[[ ! -e '$out' ]]"
expect "does not leak the wrong password" "! grep -q 'wrong-password' '$work/stdout' '$work/stderr'"

out="$work/out6/key.jks"
run_script "$out" "$good_b64" "$PASSWORD" "no-such-alias" "$good_sha1"; code=$?
expect "exits 1 for an unknown alias" "[[ $code -eq 1 && ! -e '$out' ]]"

out="$work/out7/key.jks"
run_script "$out" "$(printf 'this is not a keystore' | base64)" "$PASSWORD" "$ALIAS_NAME" "$good_sha1"; code=$?
expect "exits 1 when the decoded file is not a keystore" "[[ $code -eq 1 && ! -e '$out' ]]"

out="$work/out8/key.jks"
run_script "$out" "!!!not-base64!!!" "$PASSWORD" "$ALIAS_NAME" "$good_sha1"; code=$?
expect "exits 1 for invalid base64 and leaves no file" "[[ $code -eq 1 && ! -e '$out' ]]"

echo "== missing input"
for name in ANDROID_UPLOAD_KEYSTORE_BASE64 ANDROID_UPLOAD_STORE_PASSWORD ANDROID_UPLOAD_KEY_ALIAS ANDROID_UPLOAD_SHA1; do
  out="$work/missing-$name/key.jks"
  env \
    ANDROID_UPLOAD_KEYSTORE_BASE64="$good_b64" ANDROID_UPLOAD_STORE_PASSWORD="$PASSWORD" \
    ANDROID_UPLOAD_KEY_ALIAS="$ALIAS_NAME" ANDROID_UPLOAD_SHA1="$good_sha1" \
    "$name=" "$script" "$out" > /dev/null 2> "$work/stderr"
  code=$?
  expect "exits 2 and names $name when it is empty" "[[ $code -eq 2 ]] && grep -q '$name' '$work/stderr' && [[ ! -e '$out' ]]"
done

"$script" > /dev/null 2>&1
expect "exits 2 when no output path is given" "[[ $? -eq 2 ]]"

echo
if (( failures > 0 )); then
  echo "$failures test(s) failed."
  exit 1
fi
echo "All keystore tests passed."
