# disk-cleanup

Frees disk space on a GitHub-hosted runner before a heavy native build, then fails in seconds with a clear message if there still is not enough.

[← Back to add-ons](../README.md)

## What it does

Two small scripts:

- **`reclaim-runner-disk.sh`** deletes preinstalled toolchains a mobile build never uses: .NET, GHC, PowerShell, Swift, CodeQL, Chromium, and the Android emulator and system images. In the project this came from, that freed roughly 30 GB on a hosted runner. That figure is from memory, not measured here, so check the before and after output on your own runner.
- **`check-free-disk.sh`** reads the free space and fails with a plain error if it is below a minimum you choose.

It leaves the Android SDK platforms, build-tools, cmake and the NDK alone. Native modules compile C++ against the NDK, so removing it breaks the build in a way that looks unrelated.

## Needs

- **Variables:** none.
- **Secrets:** none.
- **Other add-ons:** none.

## Wire it in

1. Copy `files/scripts/reclaim-runner-disk.sh` and `files/scripts/check-free-disk.sh` to `scripts/` in your repository, and keep them executable.
2. In `.github/workflows/_publish.yml`, add these steps before the **Build** step:

   ```yaml
         - name: Reclaim runner disk space
           if: runner.environment == 'github-hosted'
           run: scripts/reclaim-runner-disk.sh

         - name: Verify enough disk space for the build
           run: scripts/check-free-disk.sh 12
   ```

3. Change `12` to the number of GiB your build needs. The Android release build this came from ran out of space starting at 6.7 GiB, so 12 left a margin.

## Safe by default

- It does nothing on a self-hosted runner. The script checks `RUNNER_ENVIRONMENT` itself, not only the workflow's `if:`, because it deletes system directories. That costs nothing on a VM destroyed after the job, but permanently removes tools from a persistent machine that other repositories may use. A runner that cannot be identified is skipped too.
- A path that is missing from a newer runner image is ignored, not treated as a failure.
- It never publishes or uploads anything.

## How it was tested

Against a fake filesystem in a temporary folder, with the real scripts:

```bash
addons/disk-cleanup/tests/run.sh
```

The tests check that every listed toolchain is removed, that the NDK, build-tools and platforms are kept, that missing paths are tolerated, that a self-hosted or unidentified runner is left untouched, and that the free-space check passes, fails and rejects bad input as expected. I also broke the hosted-runner check on purpose and confirmed the tests fail.

**Not tested:** that these paths exist on a real GitHub-hosted image, and how much space it frees there. Run it once on a hosted runner and read the before and after output. Runner images change, so recheck now and then.

## Why it exists

A hosted runner has about 7 GB free. A dev APK fits. A release build does not: `expo prebuild --clean` regenerates `android/`, then Gradle builds an AAB with R8 and a JS bundle on top. The first release build died with "No space left on device" at 3.6 GB remaining.
