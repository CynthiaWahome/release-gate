#!/usr/bin/env bash
# Fails with a clear message when too little disk space is free.
#
# Run it just before a heavy build, so a full disk shows up in seconds with a
# plain reason, not about twenty minutes into Gradle with a confusing bundler
# error. Pick the threshold from what your build actually needs; the Android
# release build this came from consumed everything it had starting from
# 6.7 GiB, so it asks for 12.
#
# Usage: scripts/check-free-disk.sh [minimum-GiB] [path]
#   minimum-GiB  whole number, default 12
#   path         the disk to check, default /
set -euo pipefail

min_gib="${1:-12}"
path="${2:-/}"

if ! [[ "$min_gib" =~ ^[0-9]+$ ]]; then
  echo "::error::The minimum must be a whole number of GiB, got '$min_gib'."
  exit 2
fi

# -P gives the same column layout on Linux and macOS.
avail_kb="$(df -Pk "$path" | awk 'NR==2 {print $4}')"
if ! [[ "$avail_kb" =~ ^[0-9]+$ ]]; then
  echo "::error::Could not read the free space of '$path'."
  exit 2
fi

avail_gib=$(( avail_kb / 1024 / 1024 ))
echo "Available disk space on $path: ${avail_gib} GiB"

if (( avail_gib < min_gib )); then
  echo "::error::Only ${avail_gib} GiB free on $path, and the build needs at least ${min_gib} GiB. If a disk-reclaim step ran before this, it did not free enough. That usually means the runner image changed and some paths it removes no longer exist, so check that step's before and after output."
  exit 1
fi

echo "Enough disk space (needs ${min_gib} GiB)."
