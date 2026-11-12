#!/usr/bin/env node

// Publishes a build/version payload to one or more configured backend
// endpoints after a release has been accepted.
//
// Safe by default: if BUILD_NUMBER_SYNC_URLS is not set, it prints a skip
// message and exits 0 without making any request.
//
// When enabled it requires:
//   - BUILD_NUMBER_SYNC_URLS    comma/space/newline-separated HTTPS URLs
//   - BUILD_NUMBER_SYNC_PAYLOAD valid JSON object to send as the request body
//   - BUILD_NUMBER_SYNC_KEY     shared secret sent in the auth header
//
// Optional:
//   - BUILD_NUMBER_SYNC_KEY_HEADER header name for the key (default: X-Build-Number-Key)
//   - BUILD_NUMBER_SYNC_ATTEMPTS   retry attempts per URL (default: 3)
//   - BUILD_NUMBER_SYNC_RETRY_MS   delay between retries in ms (default: 3000)
//
// Retries on network errors and 5xx responses. Does not retry on 4xx
// responses (including WAF challenge pages). Attempts every URL even if one
// fails, then exits 1 if any failed. Never prints secret values.

import { pathToFileURL } from "node:url";

const USER_AGENT = "release-gate-build-number-sync/1.0";
const DEFAULT_HEADER = "X-Build-Number-Key";

function splitUrls(raw) {
  return String(raw ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function isChallenge(body) {
  return /^\s*</.test(body) &&
    /just a moment|cf-browser-verification|challenge-platform|attention required/i.test(body);
}

export function parseConfig({ env = process.env } = {}) {
  const urls = splitUrls(env.BUILD_NUMBER_SYNC_URLS);
  if (urls.length === 0) return { skip: true, urls: [] };

  const seen = new Set();
  const targets = [];
  for (const value of urls) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`BUILD_NUMBER_SYNC_URLS contains an invalid URL: ${value}`);
    }
    if (url.protocol !== "https:") {
      throw new Error(`Refusing to send the build number sync key over ${url.protocol}//: ${value}`);
    }
    const normalized = url.toString().replace(/\/$/, "");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      targets.push(normalized);
    }
  }

  const payloadRaw = env.BUILD_NUMBER_SYNC_PAYLOAD;
  if (payloadRaw === undefined || payloadRaw === null || String(payloadRaw).trim() === "") {
    throw new Error("BUILD_NUMBER_SYNC_PAYLOAD is required when BUILD_NUMBER_SYNC_URLS is set.");
  }
  let payload;
  try {
    payload = JSON.parse(String(payloadRaw));
  } catch (error) {
    throw new Error(`BUILD_NUMBER_SYNC_PAYLOAD is not valid JSON: ${error.message}`);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("BUILD_NUMBER_SYNC_PAYLOAD must be a JSON object.");
  }

  const key = env.BUILD_NUMBER_SYNC_KEY;
  if (key === undefined || key === null || String(key).trim() === "") {
    throw new Error("BUILD_NUMBER_SYNC_KEY is required when BUILD_NUMBER_SYNC_URLS is set.");
  }

  const header = String(env.BUILD_NUMBER_SYNC_KEY_HEADER ?? DEFAULT_HEADER).trim() || DEFAULT_HEADER;
  const attempts = Number(env.BUILD_NUMBER_SYNC_ATTEMPTS ?? 3);
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error("BUILD_NUMBER_SYNC_ATTEMPTS must be a whole number of 1 or more.");
  }
  const retryMs = Number(env.BUILD_NUMBER_SYNC_RETRY_MS ?? 3000);
  if (!Number.isSafeInteger(retryMs) || retryMs < 0) {
    throw new Error("BUILD_NUMBER_SYNC_RETRY_MS must be a whole number of 0 or more.");
  }

  return { skip: false, urls: targets, payload, key: String(key), header, attempts, retryMs };
}

export async function publishTo(url, config, {
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= config.attempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          [config.header]: config.key,
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify(config.payload),
      });
    } catch (error) {
      lastError = `network error: ${error.message}`;
      if (attempt < config.attempts) {
        await sleep(config.retryMs);
        continue;
      }
      return { ok: false, error: lastError };
    }

    if (response.ok) return { ok: true };

    const body = await response.text().catch(() => "");
    if (isChallenge(body)) {
      return {
        ok: false,
        error: `HTTP ${response.status}: blocked by a WAF challenge before reaching the backend.`,
      };
    }

    const detail = String(body).slice(0, 300);
    if (response.status >= 400 && response.status < 500) {
      return { ok: false, error: `HTTP ${response.status}: ${detail}` };
    }

    lastError = `HTTP ${response.status}: ${detail}`;
    if (attempt < config.attempts) {
      await sleep(config.retryMs);
      continue;
    }
  }
  return { ok: false, error: lastError };
}

export async function main({
  env = process.env,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  out = (line) => console.log(line),
  err = (line) => console.error(line),
} = {}) {
  let config;
  try {
    config = parseConfig({ env });
  } catch (error) {
    err(error.message);
    return 1;
  }

  if (config.skip) {
    out("No build number sync URLs configured. Skipping.");
    return 0;
  }

  out(`Publishing build number payload to ${config.urls.length} endpoint(s).`);
  const results = [];
  for (const url of config.urls) {
    out(`→ ${url}`);
    const result = await publishTo(url, config, { fetchImpl, sleep });
    if (result.ok) out("  ok");
    else err(`  failed: ${result.error}`);
    results.push({ url, ...result });
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    err(`Build number sync failed for ${failed.length}/${results.length} endpoint(s).`);
    return 1;
  }

  out("All endpoints updated.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
