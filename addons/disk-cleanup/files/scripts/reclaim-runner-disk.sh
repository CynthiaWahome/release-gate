#!/usr/bin/env bash
# Frees disk space on a GitHub-hosted runner before a heavy native build.
#
# A hosted runner starts with most of its disk already used by preinstalled
# toolchains. An Android release build (expo prebuild, then Gradle with R8 and
# a JS bundle on top) can run out of space with only a few GiB left. Everything
# removed below is preinstalled software a mobile build never uses.
#
# Deliberately NOT removed: the Android SDK platforms and build-tools, cmake,
# and above all the NDK. Native modules compile C++ against the NDK, so
# deleting it breaks the build in a way that looks unrelated.
#
# This only ever runs on a GitHub-hosted runner. That check lives in this
# script, not just in the workflow's `if:`, because the script deletes system
# directories. That is free on a VM destroyed at the end of the job, and
# destructive on a persistent self-hosted machine that other repositories may
# rely on. Anything that is not hosted, or cannot be identified, is skipped.
#
# Usage: scripts/reclaim-runner-disk.sh
#
# For tests only:
#   RECLAIM_ROOT  prefix added to every path, so tests can use a temp folder
#   RECLAIM_SUDO  command placed before rm; defaults to sudo, "" for none
set -euo pipefail

if [[ "${RUNNER_ENVIRONMENT:-}" != "github-hosted" ]]; then
  echo "Not a GitHub-hosted runner (RUNNER_ENVIRONMENT='${RUNNER_ENVIRONMENT:-unset}'). Skipping disk reclaim."
  exit 0
fi

root="${RECLAIM_ROOT:-}"
sudo_cmd="${RECLAIM_SUDO-sudo}"

paths=(
  /usr/share/dotnet
  /opt/ghc
  /usr/local/.ghcup
  /usr/local/share/powershell
  /usr/share/swift
  /opt/hostedtoolcache/CodeQL
  /usr/local/share/chromium
  /opt/hostedtoolcache/chromium
  # Emulator images are the largest Android component, and a build never
  # boots a device.
  /usr/local/lib/android/sdk/emulator
  /usr/local/lib/android/sdk/system-images
)

echo "Disk before cleanup:"
df -h "${root:-/}"

for path in "${paths[@]}"; do
  # Each removal is tolerant: a path missing from a future runner image must
  # not fail the release.
  # shellcheck disable=SC2086
  $sudo_cmd rm -rf "${root}${path}" || true
done

echo "Disk after cleanup:"
df -h "${root:-/}"
