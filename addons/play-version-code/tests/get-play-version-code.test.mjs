// Tests for get-play-version-code.mjs, using a fake Google Play client.
//
// These prove the logic: what is picked, what is printed where, and how each
// kind of error is handled. They do not prove what the real Google Play API
// returns, or that a real service account has the right permissions.
//
// Run: node --test addons/play-version-code/tests/get-play-version-code.test.mjs

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  highestVersionCode,
  main,
} from "../files/scripts/get-play-version-code.mjs";

const script = fileURLToPath(
  new URL("../files/scripts/get-play-version-code.mjs", import.meta.url),
);

const validEnv = {
  PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "x" }),
};

/** Builds a fake androidpublisher client and records every call to it. */
function fakeClient({
  tracks = [],
  insertError,
  listError,
  availability = { countries: [] },
  availabilityError,
  deleteError,
} = {}) {
  const calls = { insert: [], list: [], availability: [], delete: [] };
  const client = {
    edits: {
      insert: async (args) => {
        calls.insert.push(args);
        if (insertError) throw insertError;
        return { data: { id: "edit-1" } };
      },
      delete: async (args) => {
        calls.delete.push(args);
        if (deleteError) throw deleteError;
        return {};
      },
      tracks: {
        list: async (args) => {
          calls.list.push(args);
          if (listError) throw listError;
          return { data: { tracks } };
        },
      },
      countryavailability: {
        get: async (args) => {
          calls.availability.push(args);
          if (availabilityError) throw availabilityError;
          return { data: availability };
        },
      },
    },
  };
  return { client, calls };
}

async function run({ argv = ["com.example.app"], env = validEnv, client, createClient } = {}) {
  const out = [];
  const err = [];
  const code = await main({
    argv,
    env,
    createClient: createClient ?? (async () => client),
    out: (line) => out.push(String(line)),
    err: (line) => err.push(String(line)),
  });
  return { code, out, err };
}

function httpError(status, message = "boom") {
  const error = new Error(message);
  error.response = { status };
  return error;
}

// highestVersionCode

test("picks the highest code across every track and release", () => {
  const tracks = [
    { track: "internal", releases: [{ versionCodes: ["5", "9"] }] },
    { track: "production", releases: [{ versionCodes: ["12"] }, { versionCodes: ["3"] }] },
    { track: "beta", releases: [{ versionCodes: ["7"] }] },
  ];
  assert.equal(highestVersionCode(tracks), 12);
});

test("returns 0 when there are no tracks, releases or codes", () => {
  assert.equal(highestVersionCode([]), 0);
  assert.equal(highestVersionCode(undefined), 0);
  assert.equal(highestVersionCode([{ track: "internal" }]), 0);
  assert.equal(highestVersionCode([{ track: "internal", releases: [{}] }]), 0);
});

test("accepts numbers and numeric strings", () => {
  const tracks = [{ track: "internal", releases: [{ versionCodes: [4, "10"] }] }];
  assert.equal(highestVersionCode(tracks), 10);
});

test("ignores codes that are not numbers", () => {
  const tracks = [{ track: "internal", releases: [{ versionCodes: ["abc", "6", null, undefined] }] }];
  assert.equal(highestVersionCode(tracks), 6);
});

test("compares numerically, not as text", () => {
  const tracks = [{ track: "internal", releases: [{ versionCodes: ["9", "100", "20"] }] }];
  assert.equal(highestVersionCode(tracks), 100);
});

// main: success

test("prints only the highest code on stdout", async () => {
  const { client } = fakeClient({
    tracks: [{ track: "internal", releases: [{ versionCodes: ["41", "42"] }] }],
  });
  const result = await run({ client });
  assert.equal(result.code, 0);
  assert.deepEqual(result.out, ["42"]);
});

test("prints 0 for an app with a track but no releases", async () => {
  const { client } = fakeClient({ tracks: [{ track: "internal", releases: [] }] });
  const result = await run({ client });
  assert.equal(result.code, 0);
  assert.deepEqual(result.out, ["0"]);
});

test("sends diagnostics to stderr, never stdout", async () => {
  const { client } = fakeClient({
    tracks: [{ track: "alpha", releases: [{ versionCodes: ["8"] }] }],
  });
  const result = await run({ argv: ["com.example.app", "alpha"], client });
  assert.deepEqual(result.out, ["8"]);
  assert.ok(result.err.some((line) => line.includes('all tracks, "alpha"')));
  assert.ok(result.err.some((line) => line.includes('track "alpha" country availability')));
  assert.ok(result.err.some((line) => line.includes('track "alpha" releases')));
});

test("skips the track diagnostics when no track is named", async () => {
  const { client, calls } = fakeClient({
    tracks: [{ track: "alpha", releases: [{ versionCodes: ["8"] }] }],
  });
  const result = await run({ client });
  assert.equal(calls.availability.length, 0);
  assert.ok(!result.err.some((line) => line.includes("country availability")));
});

test("still succeeds when the country availability read fails", async () => {
  const { client } = fakeClient({
    tracks: [{ track: "alpha", releases: [{ versionCodes: ["8"] }] }],
    availabilityError: new Error("not allowed"),
  });
  const result = await run({ argv: ["com.example.app", "alpha"], client });
  assert.equal(result.code, 0);
  assert.deepEqual(result.out, ["8"]);
  assert.ok(result.err.some((line) => line.includes("Could not read country availability")));
});

test("opens one edit for the package and deletes it afterwards", async () => {
  const { client, calls } = fakeClient({
    tracks: [{ track: "internal", releases: [{ versionCodes: ["3"] }] }],
  });
  await run({ client });
  assert.deepEqual(calls.insert, [{ packageName: "com.example.app" }]);
  assert.deepEqual(calls.list, [{ packageName: "com.example.app", editId: "edit-1" }]);
  assert.deepEqual(calls.delete, [{ packageName: "com.example.app", editId: "edit-1" }]);
});

test("a failure to delete the edit does not fail the lookup", async () => {
  const { client } = fakeClient({
    tracks: [{ track: "internal", releases: [{ versionCodes: ["3"] }] }],
    deleteError: new Error("cannot delete"),
  });
  const result = await run({ client });
  assert.equal(result.code, 0);
  assert.deepEqual(result.out, ["3"]);
});

// main: errors

test("treats a 404 as no releases yet, prints 0, and warns on stderr", async () => {
  const { client } = fakeClient({ listError: httpError(404) });
  const result = await run({ client });
  assert.equal(result.code, 0);
  assert.deepEqual(result.out, ["0"]);
  assert.ok(result.err.some((line) => line.includes("[warning]") && line.includes("check the package name")));
});

test("reads a 404 from error.code as well as error.response.status", async () => {
  const error = new Error("not found");
  error.code = 404;
  const { client } = fakeClient({ insertError: error });
  const result = await run({ client });
  assert.equal(result.code, 0);
  assert.deepEqual(result.out, ["0"]);
});

test("does not try to delete an edit that was never created", async () => {
  const { client, calls } = fakeClient({ insertError: httpError(404) });
  await run({ client });
  assert.equal(calls.delete.length, 0);
});

test("fails with a message and prints nothing on stdout for a 403", async () => {
  const { client } = fakeClient({ listError: httpError(403, "forbidden") });
  const result = await run({ client });
  assert.equal(result.code, 1);
  assert.deepEqual(result.out, []);
  assert.ok(result.err.some((line) => line.includes("Failed to read existing Play Console versionCodes") && line.includes("forbidden")));
});

test("fails on a server error rather than guessing 0", async () => {
  const { client } = fakeClient({ listError: httpError(500, "server down") });
  const result = await run({ client });
  assert.equal(result.code, 1);
  assert.deepEqual(result.out, []);
});

test("deletes the edit even when the track list fails", async () => {
  const { client, calls } = fakeClient({ listError: httpError(500) });
  await run({ client });
  assert.equal(calls.delete.length, 1);
});

// main: inputs

test("fails with usage when the package name is missing", async () => {
  let clientCreated = false;
  const result = await run({
    argv: [],
    createClient: async () => {
      clientCreated = true;
    },
  });
  assert.equal(result.code, 1);
  assert.ok(result.err[0].startsWith("Usage:"));
  assert.equal(clientCreated, false);
});

test("fails when the service account variable is missing", async () => {
  let clientCreated = false;
  const result = await run({
    env: {},
    createClient: async () => {
      clientCreated = true;
    },
  });
  assert.equal(result.code, 1);
  assert.ok(result.err[0].includes("PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON is required"));
  assert.equal(clientCreated, false);
});

test("fails when the service account variable is not valid JSON", async () => {
  let clientCreated = false;
  const result = await run({
    env: { PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: "{not json" },
    createClient: async () => {
      clientCreated = true;
    },
  });
  assert.equal(result.code, 1);
  assert.ok(result.err[0].includes("is not valid JSON"));
  assert.equal(clientCreated, false);
});

test("passes the parsed credentials to the client factory", async () => {
  let received;
  const { client } = fakeClient();
  await run({
    createClient: async (credentials) => {
      received = credentials;
      return client;
    },
  });
  assert.deepEqual(received, { client_email: "x" });
});

test("fails with a clear message when the client cannot be created", async () => {
  const result = await run({
    createClient: async () => {
      throw new Error("The googleapis package is not installed.");
    },
  });
  assert.equal(result.code, 1);
  assert.deepEqual(result.out, []);
  assert.ok(result.err[0].includes("Could not set up the Google Play client"));
});

// Command line

test("running the file directly prints usage and exits 1 without a package name", () => {
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.includes("Usage:"));
});

test("running the file directly fails without the service account variable", () => {
  const result = spawnSync(process.execPath, [script, "com.example.app"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.includes("PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON is required"));
});
