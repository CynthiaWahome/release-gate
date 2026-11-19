import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { main, validateServiceAccountJson } from "../files/scripts/check-play-upload.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "files", "scripts", "check-play-upload.mjs");
const temps = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "play-upload-test-"));
  temps.push(d);
  return d;
}
after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

const goodSa = JSON.stringify({ type: "service_account", client_email: "a@b.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n" });

function run({ argv = [], env = {}, fileExists } = {}) {
  const out = [];
  const err = [];
  const code = main({
    argv,
    env,
    fileExists: fileExists ?? (() => true),
    out: (l) => out.push(String(l)),
    err: (l) => err.push(String(l)),
  });
  return { code, out, err };
}

test("skips when PLAY_UPLOAD_ENABLED is not true", () => {
  for (const value of [undefined, "", "false", "0", "no", "TRUE-ish"]) {
    const r = run({ env: { PLAY_UPLOAD_ENABLED: value } });
    assert.equal(r.code, 0, String(value));
    assert.match(r.out.join("\n"), /Skipping Play upload/);
    assert.equal(r.err.length, 0);
  }
});

test("skips without requiring other inputs when disabled", () => {
  const r = run({ env: {}, fileExists: () => false });
  assert.equal(r.code, 0);
  assert.match(r.out[0], /Skipping Play upload/);
});

test("passes when enabled and all inputs are valid", () => {
  const r = run({
    env: {
      PLAY_UPLOAD_ENABLED: "true",
      ANDROID_PACKAGE_NAME: "com.example.app",
      PLAY_STORE_TRACK: "internal",
      AAB_PATH: "/tmp/app.aab",
      PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: goodSa,
    },
  });
  assert.equal(r.code, 0);
  assert.match(r.out[0], /Play upload checks passed for com\.example\.app \(track: internal\)/);
  assert.equal(r.err.length, 0);
});

test("accepts PLAY_UPLOAD_ENABLED true in any case/whitespace", () => {
  for (const value of ["true", "TRUE", " True "]) {
    const r = run({ env: { PLAY_UPLOAD_ENABLED: value, ANDROID_PACKAGE_NAME: "com.example.app", PLAY_STORE_TRACK: "alpha", AAB_PATH: "/a", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: goodSa } });
    assert.equal(r.code, 0, value);
  }
});

test("reads package, track and path from argv over env is not required but argv works", () => {
  const r = run({
    argv: ["com.example.app", "production", "/tmp/app.aab"],
    env: { PLAY_UPLOAD_ENABLED: "true", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: goodSa },
  });
  assert.equal(r.code, 0);
  assert.match(r.out[0], /com\.example\.app \(track: production\)/);
});

test("fails when package name is missing or invalid", () => {
  let r = run({ env: { PLAY_UPLOAD_ENABLED: "true", PLAY_STORE_TRACK: "internal", AAB_PATH: "/a", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: goodSa } });
  assert.equal(r.code, 1);
  assert.match(r.err[0], /ANDROID_PACKAGE_NAME is required/);

  for (const bad of ["example", "com", "com..app", ".com.app", "com.app.", "1com.app", "com.app;rm"]) {
    r = run({ env: { PLAY_UPLOAD_ENABLED: "true", ANDROID_PACKAGE_NAME: bad, PLAY_STORE_TRACK: "internal", AAB_PATH: "/a", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: goodSa } });
    assert.equal(r.code, 1, bad);
    assert.match(r.err[0], /not a valid Android package name/);
  }
});

test("fails when track is missing or invalid", () => {
  let r = run({ env: { PLAY_UPLOAD_ENABLED: "true", ANDROID_PACKAGE_NAME: "com.example.app", AAB_PATH: "/a", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: goodSa } });
  assert.equal(r.code, 1);
  assert.match(r.err[0], /PLAY_STORE_TRACK is required/);

  r = run({ env: { PLAY_UPLOAD_ENABLED: "true", ANDROID_PACKAGE_NAME: "com.example.app", PLAY_STORE_TRACK: "bad track", AAB_PATH: "/a", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: goodSa } });
  assert.equal(r.code, 1);
  assert.match(r.err[0], /invalid characters/);
});

test("fails when AAB path is missing or does not exist", () => {
  let r = run({ env: { PLAY_UPLOAD_ENABLED: "true", ANDROID_PACKAGE_NAME: "com.example.app", PLAY_STORE_TRACK: "internal", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: goodSa }, fileExists: () => false });
  assert.equal(r.code, 1);
  assert.match(r.err[0], /AAB_PATH is required/);

  r = run({ env: { PLAY_UPLOAD_ENABLED: "true", ANDROID_PACKAGE_NAME: "com.example.app", PLAY_STORE_TRACK: "internal", AAB_PATH: "/missing.aab", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: goodSa }, fileExists: () => false });
  assert.equal(r.code, 1);
  assert.match(r.err[0], /AAB_PATH does not exist/);
});

test("fails when service account JSON is missing, invalid, or wrong shape", () => {
  let r = run({ env: { PLAY_UPLOAD_ENABLED: "true", ANDROID_PACKAGE_NAME: "com.example.app", PLAY_STORE_TRACK: "internal", AAB_PATH: "/a" } });
  assert.equal(r.code, 1);
  assert.match(r.err[0], /PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON is required/);

  r = run({ env: { PLAY_UPLOAD_ENABLED: "true", ANDROID_PACKAGE_NAME: "com.example.app", PLAY_STORE_TRACK: "internal", AAB_PATH: "/a", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: "not-json" } });
  assert.equal(r.code, 1);
  assert.match(r.err[0], /not valid JSON/);

  for (const bad of [
    JSON.stringify({}),
    JSON.stringify({ type: "authorized_user", client_email: "a@b", private_key: "k" }),
    JSON.stringify({ type: "service_account", client_email: "", private_key: "k" }),
    JSON.stringify({ type: "service_account", client_email: "a@b", private_key: "" }),
    JSON.stringify({ project_info: { project_id: "x" }, client: [{}] }),
  ]) {
    r = run({ env: { PLAY_UPLOAD_ENABLED: "true", ANDROID_PACKAGE_NAME: "com.example.app", PLAY_STORE_TRACK: "internal", AAB_PATH: "/a", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: bad } });
    assert.equal(r.code, 1, bad);
    assert.match(r.err[0], /not a Google service account key/);
  }
});

test("never prints secret values on failure", () => {
  const secret = "super-secret-private-key-material";
  const sa = JSON.stringify({ type: "service_account", client_email: "a@b.iam.gserviceaccount.com", private_key: secret });
  // force failure after validation by missing path? path exists check uses fileExists true - make track invalid instead but keep secret; easier: bad package
  const r = run({ env: { PLAY_UPLOAD_ENABLED: "true", ANDROID_PACKAGE_NAME: "bad", PLAY_STORE_TRACK: "internal", AAB_PATH: "/a", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: sa } });
  assert.equal(r.code, 1);
  assert.ok(!r.err.join("\n").includes(secret));
  assert.ok(!r.out.join("\n").includes(secret));
});

test("validateServiceAccountJson throws for invalid input", () => {
  assert.throws(() => validateServiceAccountJson(undefined), /required/);
  assert.throws(() => validateServiceAccountJson("{"), /not valid JSON/);
  assert.throws(() => validateServiceAccountJson(JSON.stringify({ type: "nope" })), /not a Google service account key/);
  assert.equal(validateServiceAccountJson(goodSa), true);
});

test("runs from the command line and skips when disabled", () => {
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", env: { PATH: process.env.PATH } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Skipping Play upload/);
});

test("runs from the command line and fails when enabled but misconfigured", () => {
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", env: { PATH: process.env.PATH, PLAY_UPLOAD_ENABLED: "true" } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ANDROID_PACKAGE_NAME is required/);
});

test("runs from the command line and passes with valid args/env", () => {
  const dir = tempDir();
  const aab = join(dir, "app.aab");
  writeFileSync(aab, "x");
  const r = spawnSync(process.execPath, [script, "com.example.app", "internal", aab], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, PLAY_UPLOAD_ENABLED: "true", PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: goodSa },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Play upload checks passed/);
});
