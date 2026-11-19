# aab-build

Builds a signed Android App Bundle (`.aab`) from an Expo project, ready for a later upload step.

[← Back to add-ons](../README.md)

## What it does

This add-on provides four scripts that work together:

- **`prepare-upload-keystore.sh <output-path>`** decodes `ANDROID_UPLOAD_KEYSTORE_BASE64` to disk, verifies the key's SHA1 fingerprint matches `ANDROID_UPLOAD_SHA1` with `keytool`, and fails fast (deleting the decoded file) on a wrong key, password, alias, or unreadable keystore. The store password is passed to `keytool` via the environment, not the command line.
- **`resolve-version-code.mjs`** reads `PLAY_MAX_VERSION_CODE` (set by the [`play-version-code`](../play-version-code/README.md) add-on) and prints `PLAY_MAX_VERSION_CODE + 1`. It fails if the value is missing or invalid instead of guessing. When `GITHUB_OUTPUT` is set it also writes `version_code=<n>`.
- **`configure-release-signing.mjs [path-to-build.gradle]`** patches the Expo-generated `android/app/build.gradle` so the release build signs with the upload key read from environment variables (`ANDROID_UPLOAD_KEYSTORE_FILE`, `ANDROID_UPLOAD_STORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD`). It is idempotent and fails loudly if the expected Expo template blocks are missing, so a template change cannot silently leave the debug key in place.
- **`build-aab.mjs`** runs `expo prebuild --platform android --clean --no-install`, applies the signing patch, runs `./gradlew :app:bundleRelease`, and copies the resulting bundle to a versioned file (default `build-output/android/<ARTIFACT_NAME>-v<APP_VERSION>-b<APP_BUILD_NUMBER>.aab`). It validates required inputs and safe names, never prints signing secrets, and writes `aab_path=<path>` to `GITHUB_OUTPUT` when set.

It does **not** upload anything to Google Play. Pair it with the `play-upload` add-on (planned) or your own upload step.

## Needs

- **Variables:** none required by the scripts. `ARTIFACT_NAME` (default `app`), `OUTPUT_DIR` (default `build-output/android`), and `GRADLE_JVM_ARGS` (default `-Xmx4096m -XX:MaxMetaspaceSize=1024m`) are optional environment inputs.
- **Secrets:** `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_STORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD`, `ANDROID_UPLOAD_SHA1`. These are read only in publish/build steps inside `.github/workflows/_publish.yml` (or your equivalent publish workflow), never in request/approve workflows.
- **Packages:** none beyond what your app already needs. The build requires `expo` to be installed (the script runs `node_modules/expo/bin/cli`), plus a working JDK and Android SDK on the runner.
- **Other add-ons:** [`play-version-code`](../play-version-code/README.md), which provides `PLAY_MAX_VERSION_CODE`. If your app has no releases yet, that add-on prints `0` and `resolve-version-code.mjs` will produce `1`.

## Wire it in

1. Copy the files from `files/` to the paths listed under `copies` in `addon.json`:
   - `files/scripts/build-aab.mjs` → `scripts/build-aab.mjs`
   - `files/scripts/configure-release-signing.mjs` → `scripts/configure-release-signing.mjs`
   - `files/scripts/prepare-upload-keystore.sh` → `scripts/prepare-upload-keystore.sh`
   - `files/scripts/resolve-version-code.mjs` → `scripts/resolve-version-code.mjs`
2. Make your app config read `APP_VERSION` and `APP_BUILD_NUMBER` (for example in `app.config.ts`) so the generated Android project carries the `versionName` and `versionCode` you pass in. Without that, the bundle will not reflect the chosen version.
3. In `.github/workflows/_publish.yml`, add steps in this order (after checkout/deps/Java/Android setup and after `play-version-code` has set `PLAY_MAX_VERSION_CODE`):

   ```yaml
         - name: Prepare upload keystore
           env:
             ANDROID_UPLOAD_KEYSTORE_BASE64: ${{ secrets.ANDROID_UPLOAD_KEYSTORE_BASE64 }}
             ANDROID_UPLOAD_STORE_PASSWORD: ${{ secrets.ANDROID_UPLOAD_STORE_PASSWORD }}
             ANDROID_UPLOAD_KEY_ALIAS: ${{ secrets.ANDROID_UPLOAD_KEY_ALIAS }}
             ANDROID_UPLOAD_SHA1: ${{ secrets.ANDROID_UPLOAD_SHA1 }}
           run: scripts/prepare-upload-keystore.sh "$RUNNER_TEMP/upload-key.jks"

         - name: Resolve version code
           id: version
           env:
             PLAY_MAX_VERSION_CODE: ${{ env.PLAY_MAX_VERSION_CODE }}
           run: node scripts/resolve-version-code.mjs

         - name: Build signed AAB
           id: build_aab
           env:
             APP_VERSION: ${{ inputs.app_version }} # provide this from your release metadata
             APP_BUILD_NUMBER: ${{ steps.version.outputs.version_code }}
             ANDROID_UPLOAD_KEYSTORE_FILE: ${{ runner.temp }}/upload-key.jks
             ANDROID_UPLOAD_STORE_PASSWORD: ${{ secrets.ANDROID_UPLOAD_STORE_PASSWORD }}
             ANDROID_UPLOAD_KEY_ALIAS: ${{ secrets.ANDROID_UPLOAD_KEY_ALIAS }}
             ANDROID_UPLOAD_KEY_PASSWORD: ${{ secrets.ANDROID_UPLOAD_KEY_PASSWORD }}
           run: node scripts/build-aab.mjs
   ```

   Adjust `APP_VERSION` to come from your own source of truth (for example a release-notes file, tag, or input). Pass values through `env:`, never inline them into script text. `build-aab.mjs` sets `aab_path` in `GITHUB_OUTPUT` for later steps.
4. Create the upload keystore, record its SHA1 fingerprint (Play Console app signing or `keytool -list -v`), and store the base64-encoded keystore and signing values as the secrets above. Keep signing/store credentials in the publish workflow/environment only.

## Safe by default

- No configuration, no wiring: nothing builds and nothing uploads.
- `prepare-upload-keystore.sh` deletes the decoded keystore on any failure and exits non-zero on a fingerprint mismatch, so a wrong key cannot be used silently.
- `resolve-version-code.mjs` refuses to guess when `PLAY_MAX_VERSION_CODE` is missing.
- `configure-release-signing.mjs` and `build-aab.mjs` fail with a clear error instead of proceeding when the Expo template or required inputs do not match expectations.
- Signing passwords are read from the environment and are never printed or written into patched files.

## How it was tested

Against a fake build runner, a temporary Expo-like project, and real keystores generated with `keytool`:

```bash
addons/aab-build/tests/run.sh
# or run the full add-on suite from the repo root
scripts/test-addons.sh
```

`run.sh` runs `keystore.test.sh` (real `keytool` fingerprint checks; skipped if `keytool` is not installed) and `aab-build.test.mjs` (Node's built-in test runner). The Node tests cover version-code resolution, Gradle signing patching/idempotency/template-mismatch failures, and `build-aab` step ordering, env propagation, output naming, `GITHUB_OUTPUT`, required-input validation, safe-name checks, and failure handling — all without Expo, Gradle, JDK, Android SDK, network, or real credentials.

**Not tested:** a real Expo prebuild/Gradle AAB build, real Android SDK/JDK/runner environments, real upload keystore material against Play, or the wired `_publish.yml` flow end to end. Run it once in your CI with a real project and confirm the produced AAB is accepted by Play before relying on it.

## Why it exists

The truth-north implementation this was extracted from proved that a signed, version-correct AAB build needs careful coordination (Play-derived `versionCode`, verified upload key, patched release signing, reproducible Gradle invocation). Packaging those pieces as a generic, testable add-on lets the template reuse that behavior without hard-coding any app, package name, route, or store target.
