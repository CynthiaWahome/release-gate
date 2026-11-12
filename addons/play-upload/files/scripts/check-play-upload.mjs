#!/usr/bin/env node

// Validates that a Google Play upload is explicitly enabled and correctly
// configured before any upload step runs.
//
// Safe by default: when PLAY_UPLOAD_ENABLED is not the string "true", this
// script prints a skip message and exits 0 without checking credentials or
// files. No upload happens and nothing is contacted.
//
// When enabled it requires:
//   - ANDROID_PACKAGE_NAME (env or argv[1])
//   - PLAY_STORE_TRACK      (env or argv[2])
//   - AAB_PATH              (env or argv[3]) pointing to an existing file
//   - PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON shaped like a Google service account
//
// Usage:
//   node scripts/check-play-upload.mjs [packageName] [track] [aabPath]
//
// It never prints secret values.

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const TRACK_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isEnabled(value) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function validateServiceAccountJson(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    throw new Error("PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON is required when upload is enabled.");
  }
  let data;
  try {
    data = JSON.parse(String(raw));
  } catch {
    throw new Error(
      "PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the raw service account key contents.",
    );
  }
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.type !== "service_account" ||
    typeof data.client_email !== "string" ||
    !data.client_email ||
    typeof data.private_key !== "string" ||
    !data.private_key
  ) {
    throw new Error(
      "PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON is not a Google service account key (expected type=service_account with client_email and private_key).",
    );
  }
  return true;
}

export function main({
  argv = process.argv.slice(2),
  env = process.env,
  fileExists = existsSync,
  out = (line) => console.log(line),
  err = (line) => console.error(line),
} = {}) {
  if (!isEnabled(env.PLAY_UPLOAD_ENABLED)) {
    out("PLAY_UPLOAD_ENABLED is not \"true\". Skipping Play upload.");
    return 0;
  }

  const packageName = String(argv[0] ?? env.ANDROID_PACKAGE_NAME ?? "").trim();
  const track = String(argv[1] ?? env.PLAY_STORE_TRACK ?? "").trim();
  const aabPath = String(argv[2] ?? env.AAB_PATH ?? "").trim();

  if (!packageName) {
    err("ANDROID_PACKAGE_NAME is required when upload is enabled.");
    return 1;
  }
  if (!PACKAGE_RE.test(packageName)) {
    err(`ANDROID_PACKAGE_NAME "${packageName}" is not a valid Android package name.`);
    return 1;
  }
  if (!track) {
    err("PLAY_STORE_TRACK is required when upload is enabled.");
    return 1;
  }
  if (!TRACK_RE.test(track)) {
    err(`PLAY_STORE_TRACK "${track}" contains invalid characters.`);
    return 1;
  }
  if (!aabPath) {
    err("AAB_PATH is required when upload is enabled.");
    return 1;
  }
  if (!fileExists(aabPath)) {
    err(`AAB_PATH does not exist: ${aabPath}`);
    return 1;
  }

  try {
    validateServiceAccountJson(env.PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    err(error.message);
    return 1;
  }

  out(`Play upload checks passed for ${packageName} (track: ${track}).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
