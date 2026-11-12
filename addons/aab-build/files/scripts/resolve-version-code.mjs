#!/usr/bin/env node

// Works out the versionCode for the next Android build: the highest code Google
// Play already has, plus one.
//
// Usage: PLAY_MAX_VERSION_CODE=<n> node scripts/resolve-version-code.mjs
//
// PLAY_MAX_VERSION_CODE comes from the play-version-code add-on. The number is
// printed on stdout. When GITHUB_OUTPUT is set it is also written there as
// version_code=<n>, so later steps can read steps.<id>.outputs.version_code.
//
// It fails when PLAY_MAX_VERSION_CODE is missing, empty or invalid. An empty
// value almost always means the lookup step is not wired in, and guessing 1
// would build a bundle Play then rejects. If you really are starting a new app
// that has no releases, the lookup prints 0 and this prints 1.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Google Play does not accept a versionCode above this.
export const MAX_VERSION_CODE = 2_100_000_000;

/**
 * Returns the next versionCode for a PLAY_MAX_VERSION_CODE value, or throws an
 * Error saying what is wrong with it.
 */
export function nextVersionCode(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    throw new Error(
      "PLAY_MAX_VERSION_CODE is not set. Run the play-version-code step first, and save its result as PLAY_MAX_VERSION_CODE.",
    );
  }

  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(
      `PLAY_MAX_VERSION_CODE must be a whole number of zero or more, got "${text}".`,
    );
  }

  const highest = Number(text);
  if (!Number.isSafeInteger(highest) || highest + 1 > MAX_VERSION_CODE) {
    throw new Error(
      `PLAY_MAX_VERSION_CODE "${text}" is too large. Google Play accepts a versionCode up to ${MAX_VERSION_CODE}.`,
    );
  }

  return highest + 1;
}

export function main({
  env = process.env,
  out = (line) => console.log(line),
  err = (line) => console.error(line),
  appendOutput = (path, text) => appendFileSync(path, text),
} = {}) {
  let versionCode;
  try {
    versionCode = nextVersionCode(env.PLAY_MAX_VERSION_CODE);
  } catch (error) {
    err(error.message);
    return 1;
  }

  if (env.GITHUB_OUTPUT) {
    appendOutput(env.GITHUB_OUTPUT, `version_code=${versionCode}\n`);
  }
  out(versionCode);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
