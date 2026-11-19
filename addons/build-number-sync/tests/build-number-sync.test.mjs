import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { main, parseConfig, publishTo } from "../files/scripts/publish-build-number.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "files", "scripts", "publish-build-number.mjs");

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`; // parseConfig enforces https; tests pass urls via config/publishTo
  try {
    return await fn(url);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function baseConfig(overrides = {}) {
  return {
    skip: false,
    urls: ["https://example.test"],
    payload: { app: "demo", build: 7 },
    key: "secret-key",
    header: "X-Build-Number-Key",
    attempts: 3,
    retryMs: 0,
    ...overrides,
  };
}

function io() {
  const out = [];
  const err = [];
  return { out, err, collect: { out: (l) => out.push(String(l)), err: (l) => err.push(String(l)) } };
}

test("parseConfig skips when no URLs are configured", () => {
  assert.deepEqual(parseConfig({ env: {} }), { skip: true, urls: [] });
  assert.deepEqual(parseConfig({ env: { BUILD_NUMBER_SYNC_URLS: "   " } }), { skip: true, urls: [] });
});

test("parseConfig parses and normalizes URLs and payload", () => {
  const cfg = parseConfig({
    env: {
      BUILD_NUMBER_SYNC_URLS: "https://a.example.com, https://b.example.com/  https://a.example.com",
      BUILD_NUMBER_SYNC_PAYLOAD: '{"app":"x","build":3}',
      BUILD_NUMBER_SYNC_KEY: "k",
    },
  });
  assert.equal(cfg.skip, false);
  assert.deepEqual(cfg.urls, ["https://a.example.com", "https://b.example.com"]);
  assert.deepEqual(cfg.payload, { app: "x", build: 3 });
  assert.equal(cfg.header, "X-Build-Number-Key");
});

test("parseConfig enforces https, valid JSON object payload, and key", () => {
  assert.throws(() => parseConfig({ env: { BUILD_NUMBER_SYNC_URLS: "http://a.test", BUILD_NUMBER_SYNC_PAYLOAD: "{}", BUILD_NUMBER_SYNC_KEY: "k" } }), /Refusing to send/);
  assert.throws(() => parseConfig({ env: { BUILD_NUMBER_SYNC_URLS: "not a url", BUILD_NUMBER_SYNC_PAYLOAD: "{}", BUILD_NUMBER_SYNC_KEY: "k" } }), /invalid URL/);
  assert.throws(() => parseConfig({ env: { BUILD_NUMBER_SYNC_URLS: "https://a.test", BUILD_NUMBER_SYNC_KEY: "k" } }), /PAYLOAD is required/);
  assert.throws(() => parseConfig({ env: { BUILD_NUMBER_SYNC_URLS: "https://a.test", BUILD_NUMBER_SYNC_PAYLOAD: "{", BUILD_NUMBER_SYNC_KEY: "k" } }), /not valid JSON/);
  assert.throws(() => parseConfig({ env: { BUILD_NUMBER_SYNC_URLS: "https://a.test", BUILD_NUMBER_SYNC_PAYLOAD: "[1]", BUILD_NUMBER_SYNC_KEY: "k" } }), /must be a JSON object/);
  assert.throws(() => parseConfig({ env: { BUILD_NUMBER_SYNC_URLS: "https://a.test", BUILD_NUMBER_SYNC_PAYLOAD: "{}", BUILD_NUMBER_SYNC_KEY: " " } }), /KEY is required/);
});

test("main skips when not configured", async () => {
  const c = io();
  const code = await main({ env: {}, ...c.collect });
  assert.equal(code, 0);
  assert.match(c.out.join("\n"), /Skipping/);
});

test("publishTo posts payload and auth header on success", async () => {
  await withServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      assert.equal(req.method, "POST");
      assert.equal(req.headers["x-build-number-key"], "secret-key");
      assert.equal(req.headers["content-type"], "application/json");
      assert.deepEqual(JSON.parse(body), { app: "demo", build: 7 });
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
  }, async (url) => {
    const result = await publishTo(url, baseConfig(), { sleep: async () => {} });
    assert.deepEqual(result, { ok: true });
  });
});

test("publishTo retries on 5xx and then succeeds", async () => {
  let calls = 0;
  await withServer((req, res) => {
    calls += 1;
    req.resume();
    req.on("end", () => {
      if (calls < 3) {
        res.writeHead(503);
        res.end("busy");
      } else {
        res.writeHead(200);
        res.end("ok");
      }
    });
  }, async (url) => {
    const result = await publishTo(url, baseConfig({ attempts: 3 }), { sleep: async () => {} });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 3);
  });
});

test("publishTo does not retry on 4xx and reports detail", async () => {
  let calls = 0;
  await withServer((req, res) => {
    calls += 1;
    req.resume();
    req.on("end", () => { res.writeHead(401); res.end("bad key"); });
  }, async (url) => {
    const result = await publishTo(url, baseConfig({ attempts: 3 }), { sleep: async () => {} });
    assert.equal(result.ok, false);
    assert.match(result.error, /HTTP 401/);
    assert.equal(calls, 1);
  });
});

test("publishTo detects WAF/challenge HTML and does not retry", async () => {
  let calls = 0;
  await withServer((req, res) => {
    calls += 1;
    req.resume();
    req.on("end", () => { res.writeHead(403, { "content-type": "text/html" }); res.end("<!DOCTYPE html><title>Just a moment...</title>"); });
  }, async (url) => {
    const result = await publishTo(url, baseConfig({ attempts: 3 }), { sleep: async () => {} });
    assert.equal(result.ok, false);
    assert.match(result.error, /WAF challenge/);
    assert.equal(calls, 1);
  });
});

test("publishTo retries on network errors", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 2) throw new Error("connect reset");
    return new Response("ok", { status: 200 });
  };
  const result = await publishTo("https://example.test", baseConfig({ attempts: 3 }), { fetchImpl, sleep: async () => {} });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("main attempts every endpoint and fails if any fails", async () => {
  let okCalls = 0;
  let badCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("good")) { okCalls += 1; return new Response("ok", { status: 200 }); }
    badCalls += 1;
    return new Response("nope", { status: 401 });
  };
  const c = io();
  const code = await main({
    env: {
      BUILD_NUMBER_SYNC_URLS: "https://good.example, https://bad.example",
      BUILD_NUMBER_SYNC_PAYLOAD: '{"app":"x","build":1}',
      BUILD_NUMBER_SYNC_KEY: "k",
      BUILD_NUMBER_SYNC_ATTEMPTS: "1",
    },
    fetchImpl,
    sleep: async () => {},
    ...c.collect,
  });
  assert.equal(code, 1);
  assert.equal(okCalls, 1);
  assert.equal(badCalls, 1);
  assert.match(c.err.join("\n"), /failed for 1\/2/);
});

test("main reports config errors and never prints key", async () => {
  const c = io();
  const code = await main({ env: { BUILD_NUMBER_SYNC_URLS: "http://bad" }, ...c.collect });
  assert.equal(code, 1);
  assert.match(c.err.join("\n"), /Refusing to send/);
  assert.ok(!c.err.join("\n").includes("secret"));
});

test("CLI skips when not configured", () => {
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", env: { PATH: process.env.PATH } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Skipping/);
});

test("CLI fails on bad config", () => {
  const r = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, BUILD_NUMBER_SYNC_URLS: "http://example.com", BUILD_NUMBER_SYNC_PAYLOAD: "{}", BUILD_NUMBER_SYNC_KEY: "k" },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to send/);
});
