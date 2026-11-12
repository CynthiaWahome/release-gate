#!/usr/bin/env node

// Looks up the highest Android versionCode Google Play already knows about for
// a package, across every track (internal, alpha, beta, production and any
// custom ones) and every release on those tracks, not just the last one this
// workflow set. That makes it safe even if someone uploads a build to Play by
// hand: the next automated release reads Play's own truth, not a local counter.
//
// Usage: node scripts/get-play-version-code.mjs <packageName> [track]
//
// Needs PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON in the environment: the contents of
// a Google Play service account key. It only reads. It never changes anything
// in Play Console.
//
// STDOUT carries exactly one integer: 0 if the app has no releases on Play yet,
// otherwise the highest versionCode found. Callers capture stdout as "the
// version code", so everything else, including the diagnostics below, goes to
// STDERR. Your build should use this number plus one.
//
// The diagnostics print every track the package has and, for the track you
// name, its releases and country availability. A package can have more tracks
// than the one your workflow publishes to, and a workflow will quietly keep
// publishing to the wrong one if nobody compares the two against what Play
// Console shows.

import { pathToFileURL } from "node:url";

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

/**
 * Returns the highest versionCode across every track and release, or 0 when
 * there are none. Anything that is not a finite number is ignored.
 */
export function highestVersionCode(tracks) {
  const codes = (tracks ?? [])
    .flatMap((track) => track.releases ?? [])
    .flatMap((release) => release.versionCodes ?? [])
    .map(Number)
    .filter(Number.isFinite);

  return codes.length > 0 ? Math.max(...codes) : 0;
}

/**
 * The real Google client. googleapis is loaded only here, so importing this
 * file (for tests, or to reuse highestVersionCode) does not need it installed.
 */
export async function createGoogleClient(credentials) {
  let google;
  try {
    ({ google } = await import("googleapis"));
  } catch {
    throw new Error(
      "The googleapis package is not installed. Run: npm install --save-dev googleapis",
    );
  }

  const auth = new google.auth.GoogleAuth({ credentials, scopes: [SCOPE] });
  return google.androidpublisher({ version: "v3", auth });
}

/**
 * Runs the whole lookup and returns the process exit code. Everything it needs
 * from the outside world is passed in, so tests can supply fakes.
 */
export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  createClient = createGoogleClient,
  out = (line) => console.log(line),
  err = (line) => console.error(line),
} = {}) {
  const [packageName, track] = argv;

  if (!packageName) {
    err("Usage: node scripts/get-play-version-code.mjs <packageName> [track]");
    return 1;
  }

  const serviceAccountJson = env.PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    err("PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON is required.");
    return 1;
  }

  let credentials;
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch (error) {
    err(`PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON is not valid JSON: ${error.message}`);
    return 1;
  }

  let androidpublisher;
  try {
    androidpublisher = await createClient(credentials);
  } catch (error) {
    err(`Could not set up the Google Play client: ${error.message}`);
    return 1;
  }

  let editId;

  try {
    const edit = await androidpublisher.edits.insert({ packageName });
    editId = edit.data.id;

    const { data } = await androidpublisher.edits.tracks.list({
      packageName,
      editId,
    });

    const tracks = data.tracks ?? [];

    for (const entry of tracks) {
      err(
        `[diagnostic] ${packageName} all tracks, "${entry.track}": ${JSON.stringify(entry.releases ?? [])}`,
      );
    }

    if (track) {
      try {
        const { data: availability } =
          await androidpublisher.edits.countryavailability.get({
            packageName,
            editId,
            track,
          });
        err(
          `[diagnostic] ${packageName} track "${track}" country availability: ${JSON.stringify(availability)}`,
        );
      } catch (availabilityError) {
        err(
          `[diagnostic] Could not read country availability for ${packageName} track "${track}": ${availabilityError.message}`,
        );
      }

      const trackData = tracks.find((t) => t.track === track);
      err(
        `[diagnostic] ${packageName} track "${track}" releases: ${JSON.stringify(trackData?.releases ?? [])}`,
      );
    }

    out(highestVersionCode(tracks));
    return 0;
  } catch (error) {
    const status = error?.response?.status ?? error?.code;

    // A brand-new app with nothing published returns 404 for the track list.
    // Treat that as "no existing versionCode", not a failure. The same 404 is
    // what a mistyped package name returns, so say so on stderr.
    if (status === 404) {
      err(
        `[warning] Google Play returned 404 for ${packageName}. Treating it as having no releases yet. If the app already exists, check the package name.`,
      );
      out(0);
      return 0;
    }

    err(
      `Failed to read existing Play Console versionCodes for ${packageName}: ${error.message}`,
    );
    return 1;
  } finally {
    if (editId) {
      // Best effort. This edit only read data and changed nothing, so a failure
      // to delete it is not worth failing the build for.
      await androidpublisher.edits
        .delete({ packageName, editId })
        .catch(() => {});
    }
  }
}

// Run only when started from the command line, not when imported by a test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
