#!/usr/bin/env node

// Makes the generated Android project sign its release build with your upload
// key instead of the debug key.
//
// `expo prebuild` writes android/app/build.gradle with the release build signed
// by the debug keystore. This swaps that for a release signing config that
// reads the key from environment variables, so no password is ever written to
// disk:
//   ANDROID_UPLOAD_KEYSTORE_FILE, ANDROID_UPLOAD_STORE_PASSWORD,
//   ANDROID_UPLOAD_KEY_ALIAS, ANDROID_UPLOAD_KEY_PASSWORD
//
// Usage: node scripts/configure-release-signing.mjs [path-to-build.gradle]
//   default: android/app/build.gradle
//
// It matches the exact text the Expo template generates, and stops with an
// error when it cannot find it. That is deliberate: a template change that
// silently left the debug key in place would build a bundle Play rejects, or
// worse, one signed with the wrong key. Running it twice is safe.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEBUG_SIGNING_BLOCK = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
`;

const RELEASE_SIGNING_BLOCK = `${DEBUG_SIGNING_BLOCK}        release {
            storeFile file(System.getenv("ANDROID_UPLOAD_KEYSTORE_FILE"))
            storePassword System.getenv("ANDROID_UPLOAD_STORE_PASSWORD")
            keyAlias System.getenv("ANDROID_UPLOAD_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_UPLOAD_KEY_PASSWORD")
        }
`;

const DEBUG_RELEASE_SIGNING = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const UPLOAD_RELEASE_SIGNING = "            signingConfig signingConfigs.release";

const ALREADY_PATCHED_MARKER = 'System.getenv("ANDROID_UPLOAD_KEYSTORE_FILE")';

/**
 * Returns the build.gradle text with release signing configured, or throws an
 * Error saying which expected block is missing.
 */
export function patchBuildGradle(text) {
  if (text.includes(ALREADY_PATCHED_MARKER)) {
    return text;
  }

  if (!text.includes(DEBUG_SIGNING_BLOCK)) {
    throw new Error(
      "Unable to locate the generated Android debug signing block. The Expo Android template may have changed.",
    );
  }

  if (!text.includes(DEBUG_RELEASE_SIGNING)) {
    throw new Error(
      "Unable to locate the generated Android release signing config. The Expo Android template may have changed.",
    );
  }

  // Functions as the replacement, so "$" in the text is never read as a pattern.
  return text
    .replace(DEBUG_SIGNING_BLOCK, () => RELEASE_SIGNING_BLOCK)
    .replace(DEBUG_RELEASE_SIGNING, () => UPLOAD_RELEASE_SIGNING);
}

export function main({
  argv = process.argv.slice(2),
  read = (path) => readFileSync(path, "utf8"),
  write = (path, text) => writeFileSync(path, text),
  out = (line) => console.log(line),
  err = (line) => console.error(line),
} = {}) {
  const path = argv[0] ?? "android/app/build.gradle";

  let text;
  try {
    text = read(path);
  } catch (error) {
    err(`Android app Gradle file was not found at ${path}: ${error.message}`);
    return 1;
  }

  let patched;
  try {
    patched = patchBuildGradle(text);
  } catch (error) {
    err(error.message);
    return 1;
  }

  if (patched === text) {
    out(`${path} already signs the release build with the upload key.`);
    return 0;
  }

  write(path, patched);
  out(`Configured ${path} to sign the release build with the upload key.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
