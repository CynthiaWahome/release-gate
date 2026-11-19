#!/usr/bin/env bash
# Tests for the disk-cleanup add-on. Run from anywhere:
#   addons/disk-cleanup/tests/run.sh
#
# These run the real scripts against a temporary folder that stands in for the
# runner's filesystem, so nothing outside it is touched. They prove the logic.
# They do not prove the listed paths exist on a real GitHub-hosted image.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
reclaim="$here/../files/scripts/reclaim-runner-disk.sh"
check="$here/../files/scripts/check-free-disk.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

failures=0
pass() { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; failures=$((failures + 1)); }
expect() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

# Builds a fake runner filesystem: things to remove and things to keep.
make_root() {
  local root="$1"
  mkdir -p \
    "$root/usr/share/dotnet" \
    "$root/opt/ghc" \
    "$root/usr/local/.ghcup" \
    "$root/usr/local/share/powershell" \
    "$root/usr/share/swift" \
    "$root/opt/hostedtoolcache/CodeQL" \
    "$root/usr/local/share/chromium" \
    "$root/opt/hostedtoolcache/chromium" \
    "$root/usr/local/lib/android/sdk/emulator" \
    "$root/usr/local/lib/android/sdk/system-images" \
    "$root/usr/local/lib/android/sdk/ndk/26.1" \
    "$root/usr/local/lib/android/sdk/build-tools/34.0.0" \
    "$root/usr/local/lib/android/sdk/platforms/android-34" \
    "$root/opt/hostedtoolcache/node"
  echo data > "$root/usr/share/dotnet/file"
  echo data > "$root/usr/local/lib/android/sdk/ndk/26.1/file"
}

removed_dirs=(
  usr/share/dotnet opt/ghc usr/local/.ghcup usr/local/share/powershell
  usr/share/swift opt/hostedtoolcache/CodeQL usr/local/share/chromium
  opt/hostedtoolcache/chromium usr/local/lib/android/sdk/emulator
  usr/local/lib/android/sdk/system-images
)
kept_dirs=(
  usr/local/lib/android/sdk/ndk/26.1
  usr/local/lib/android/sdk/build-tools/34.0.0
  usr/local/lib/android/sdk/platforms/android-34
  opt/hostedtoolcache/node
)

all_gone() { local r="$1" d; for d in "${removed_dirs[@]}"; do [[ -e "$r/$d" ]] && return 1; done; return 0; }
all_kept() { local r="$1" d; for d in "${kept_dirs[@]}"; do [[ -d "$r/$d" ]] || return 1; done; return 0; }
all_present() { local r="$1" d; for d in "${removed_dirs[@]}"; do [[ -d "$r/$d" ]] || return 1; done; return 0; }

echo "== reclaim-runner-disk.sh"

root1="$work/hosted"; make_root "$root1"
RUNNER_ENVIRONMENT=github-hosted RECLAIM_ROOT="$root1" RECLAIM_SUDO="" "$reclaim" > "$work/out1" 2>&1
code=$?
expect "exits 0 on a hosted runner" "[[ $code -eq 0 ]]"
expect "removes every listed toolchain" "all_gone '$root1'"
expect "keeps the NDK, build-tools, platforms and other tools" "all_kept '$root1'"
expect "prints disk usage before and after" "grep -q 'Disk before cleanup' '$work/out1' && grep -q 'Disk after cleanup' '$work/out1'"

root2="$work/empty"; mkdir -p "$root2"
RUNNER_ENVIRONMENT=github-hosted RECLAIM_ROOT="$root2" RECLAIM_SUDO="" "$reclaim" > /dev/null 2>&1
expect "tolerates paths that do not exist" "[[ $? -eq 0 ]]"
expect "does not remove the root itself" "[[ -d '$root2' ]]"

root3="$work/selfhosted"; make_root "$root3"
RUNNER_ENVIRONMENT=self-hosted RECLAIM_ROOT="$root3" RECLAIM_SUDO="" "$reclaim" > "$work/out3" 2>&1
code=$?
expect "exits 0 on a self-hosted runner" "[[ $code -eq 0 ]]"
expect "deletes nothing on a self-hosted runner" "all_present '$root3' && all_kept '$root3'"
expect "says why it skipped" "grep -q 'Skipping disk reclaim' '$work/out3'"

root4="$work/unknown"; make_root "$root4"
env -u RUNNER_ENVIRONMENT RECLAIM_ROOT="$root4" RECLAIM_SUDO="" "$reclaim" > /dev/null 2>&1
expect "deletes nothing when the runner type is unknown" "all_present '$root4'"

echo "== check-free-disk.sh"

"$check" 0 / > "$work/out5" 2>&1
expect "passes when the minimum is 0" "[[ $? -eq 0 ]]"
expect "reports the available space" "grep -q 'Available disk space on /' '$work/out5'"

"$check" 999999999 / > "$work/out6" 2>&1
code=$?
expect "fails when the minimum is far above what is free" "[[ $code -eq 1 ]]"
expect "explains the failure as an error annotation" "grep -q '::error::Only' '$work/out6'"

"$check" abc / > /dev/null 2>&1
expect "rejects a minimum that is not a whole number" "[[ $? -eq 2 ]]"

"$check" 0 "$work/does-not-exist" > /dev/null 2>&1
expect "fails clearly for a path that does not exist" "[[ $? -ne 0 ]]"

echo
if (( failures > 0 )); then
  echo "$failures test(s) failed."
  exit 1
fi
echo "All disk-cleanup tests passed."
