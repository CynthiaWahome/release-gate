// Tests for the aab-build scripts.
//
// resolve-version-code and configure-release-signing run for real. build-aab
// runs against a temporary project with a FAKE command runner, so no Expo,
// Gradle, JDK or Android SDK is needed. They prove the logic and the order of
// steps. They do not prove a real Expo project builds a real bundle.
//
// Run: node --test addons/aab-build/tests/aab-build.test.mjs

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { main as build } from "../files/scripts/build-aab.mjs";
import {
  main as configureSigning,
  patchBuildGradle,
} from "../files/scripts/configure-release-signing.mjs";
import {
  MAX_VERSION_CODE,
  main as resolveCode,
  nextVersionCode,
} from "../files/scripts/resolve-version-code.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "..", "files", "scripts");
const fixture = readFileSync(
  join(here, "fixtures", "expo-template-build.gradle"),
  "utf8",
);

const temporaryFolders = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "aab-build-test-"));
  temporaryFolders.push(dir);
  return dir;
}
after(() => {
  for (const dir of temporaryFolders) rmSync(dir, { recursive: true, force: true });
});

// resolve-version-code

test("next version code is the highest plus one", () => {
  assert.equal(nextVersionCode("41"), 42);
  assert.equal(nextVersionCode(" 7 "), 8);
  assert.equal(nextVersionCode(0), 1);
  assert.equal(nextVersionCode("0"), 1);
});

test("a missing or empty highest code is an error, not a guess", () => {
  assert.throws(() => nextVersionCode(undefined), /PLAY_MAX_VERSION_CODE is not set/);
  assert.throws(() => nextVersionCode(""), /PLAY_MAX_VERSION_CODE is not set/);
  assert.throws(() => nextVersionCode("   "), /PLAY_MAX_VERSION_CODE is not set/);
});

test("rejects values that are not whole numbers of zero or more", () => {
  for (const bad of ["-1", "1.5", "abc", "12abc", "1e3", "0x10", "NaN"]) {
    assert.throws(() => nextVersionCode(bad), /must be a whole number/, bad);
  }
});

test("rejects a code that would pass the Play limit", () => {
  assert.equal(nextVersionCode(String(MAX_VERSION_CODE - 1)), MAX_VERSION_CODE);
  assert.throws(() => nextVersionCode(String(MAX_VERSION_CODE)), /too large/);
  assert.throws(() => nextVersionCode("99999999999999999999"), /too large/);
});

test("resolve main prints the code and writes GITHUB_OUTPUT", () => {
  const out = [];
  const written = [];
  const code = resolveCode({
    env: { PLAY_MAX_VERSION_CODE: "9", GITHUB_OUTPUT: "/tmp/out" },
    out: (line) => out.push(String(line)),
    appendOutput: (path, text) => written.push([path, text]),
  });
  assert.equal(code, 0);
  assert.deepEqual(out, ["10"]);
  assert.deepEqual(written, [["/tmp/out", "version_code=10\n"]]);
});

test("resolve main writes no output file when GITHUB_OUTPUT is unset", () => {
  const written = [];
  const code = resolveCode({
    env: { PLAY_MAX_VERSION_CODE: "9" },
    out: () => {},
    appendOutput: (...args) => written.push(args),
  });
  assert.equal(code, 0);
  assert.deepEqual(written, []);
});

test("resolve main fails and prints nothing on stdout for bad input", () => {
  const out = [];
  const err = [];
  const code = resolveCode({
    env: {},
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  assert.equal(code, 1);
  assert.deepEqual(out, []);
  assert.match(err[0], /PLAY_MAX_VERSION_CODE is not set/);
});

test("resolve-version-code runs from the command line", () => {
  const ok = spawnSync(process.execPath, [join(scripts, "resolve-version-code.mjs")], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, PLAY_MAX_VERSION_CODE: "99" },
  });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim(), "100");

  const bad = spawnSync(process.execPath, [join(scripts, "resolve-version-code.mjs")], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, "");
});

// configure-release-signing

test("the fixture still contains both blocks the patch looks for", () => {
  assert.match(fixture, /storeFile file\('debug\.keystore'\)/);
  assert.match(fixture, /signingConfig signingConfigs\.debug\n\s+def enableShrinkResources/);
});

test("patches the Expo template to sign releases with the upload key", () => {
  const patched = patchBuildGradle(fixture);
  assert.match(patched, /release \{\n\s+storeFile file\(System\.getenv\("ANDROID_UPLOAD_KEYSTORE_FILE"\)\)/);
  assert.match(patched, /storePassword System\.getenv\("ANDROID_UPLOAD_STORE_PASSWORD"\)/);
  assert.match(patched, /keyAlias System\.getenv\("ANDROID_UPLOAD_KEY_ALIAS"\)/);
  assert.match(patched, /keyPassword System\.getenv\("ANDROID_UPLOAD_KEY_PASSWORD"\)/);
});

test("the release build type now uses the release signing config", () => {
  const patched = patchBuildGradle(fixture);
  const releaseBuildType = patched.slice(patched.indexOf("buildTypes {"));
  assert.match(releaseBuildType, /release \{\n\s+signingConfig signingConfigs\.release/);
  assert.ok(!releaseBuildType.includes("Caution! In production"));
});

test("the debug build keeps the debug key", () => {
  const patched = patchBuildGradle(fixture);
  assert.match(patched, /debug \{\n\s+signingConfig signingConfigs\.debug/);
  assert.match(patched, /storeFile file\('debug\.keystore'\)/);
});

test("no secret value is written into the patched file", () => {
  const patched = patchBuildGradle(fixture);
  assert.ok(!/storePassword '(?!android')/.test(patched));
  assert.equal((patched.match(/System\.getenv/g) ?? []).length, 4);
});

test("patching twice changes nothing the second time", () => {
  const once = patchBuildGradle(fixture);
  assert.equal(patchBuildGradle(once), once);
});

test("fails loudly when the debug signing block is missing", () => {
  assert.throws(
    () => patchBuildGradle("android { }"),
    /debug signing block.*template may have changed/s,
  );
});

test("fails loudly when only the release signing line is missing", () => {
  const withoutRelease = fixture.replace("signingConfig signingConfigs.debug\n            def enableShrinkResources", "def enableShrinkResources");
  assert.throws(() => patchBuildGradle(withoutRelease), /release signing config.*template may have changed/s);
});

test("a dollar sign in the file is never read as a replacement pattern", () => {
  const withDollar = `${fixture}\n// price: $& $1 $$\n`;
  const patched = patchBuildGradle(withDollar);
  assert.ok(patched.includes("// price: $& $1 $$"));
});

test("configure main rewrites the file on disk, then reports it is already done", () => {
  const dir = tempDir();
  const path = join(dir, "build.gradle");
  writeFileSync(path, fixture);

  const first = [];
  assert.equal(configureSigning({ argv: [path], out: (l) => first.push(l) }), 0);
  assert.match(first[0], /Configured/);
  assert.match(readFileSync(path, "utf8"), /System\.getenv\("ANDROID_UPLOAD_KEYSTORE_FILE"\)/);

  const second = [];
  assert.equal(configureSigning({ argv: [path], out: (l) => second.push(l) }), 0);
  assert.match(second[0], /already signs/);
});

test("configure main fails for a missing file and an unrecognised template", () => {
  const dir = tempDir();
  const err = [];
  assert.equal(configureSigning({ argv: [join(dir, "nope.gradle")], err: (l) => err.push(l) }), 1);
  assert.match(err[0], /was not found/);

  const path = join(dir, "build.gradle");
  writeFileSync(path, "android { }");
  const err2 = [];
  assert.equal(configureSigning({ argv: [path], err: (l) => err2.push(l) }), 1);
  assert.match(err2[0], /template may have changed/);
  assert.equal(readFileSync(path, "utf8"), "android { }");
});

// build-aab

const buildEnv = (keystorePath) => ({
  APP_VERSION: "1.4.2",
  APP_BUILD_NUMBER: "43",
  ANDROID_UPLOAD_KEYSTORE_FILE: keystorePath,
  ANDROID_UPLOAD_STORE_PASSWORD: "store-secret",
  ANDROID_UPLOAD_KEY_ALIAS: "upload",
  ANDROID_UPLOAD_KEY_PASSWORD: "key-secret",
});

/** A temporary Expo-like project and a fake runner that records every command. */
function project({ prebuildWritesGradle = true, gradleStatus = 0, gradleMakesBundle = true, prebuildStatus = 0 } = {}) {
  const root = tempDir();
  mkdirSync(join(root, "node_modules", "expo", "bin"), { recursive: true });
  writeFileSync(join(root, "node_modules", "expo", "bin", "cli"), "");
  const keystore = join(root, "upload.jks");
  writeFileSync(keystore, "fake-keystore");

  const calls = [];
  const run = (command, args, { cwd, env }) => {
    calls.push({ command, args, cwd, env });
    if (args.includes("prebuild")) {
      if (prebuildWritesGradle) {
        mkdirSync(join(root, "android", "app"), { recursive: true });
        writeFileSync(join(root, "android", "app", "build.gradle"), fixture);
        writeFileSync(join(root, "android", "gradlew"), "");
      }
      return { status: prebuildStatus };
    }
    if (args.includes(":app:bundleRelease")) {
      if (gradleMakesBundle && gradleStatus === 0) {
        const dir = join(root, "android", "app", "build", "outputs", "bundle", "release");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "app-release.aab"), "bundle-bytes");
      }
      return { status: gradleStatus };
    }
    return { status: 0 };
  };
  return { root, keystore, calls, run };
}

function runBuild(p, extraEnv = {}, overrides = {}) {
  const out = [];
  const err = [];
  const code = build({
    env: { ...buildEnv(p.keystore), ...extraEnv },
    cwd: p.root,
    run: p.run,
    out: (l) => out.push(String(l)),
    err: (l) => err.push(String(l)),
    ...overrides,
  });
  return { code, out, err };
}

test("builds in order: prebuild, patch signing, gradle bundleRelease, copy bundle", () => {
  const p = project();
  const { code, out } = runBuild(p);
  assert.equal(code, 0);
  assert.equal(p.calls.length, 2);
  assert.deepEqual(p.calls[0].args.slice(1), ["prebuild", "--platform", "android", "--clean", "--no-install"]);
  assert.ok(p.calls[1].args.includes(":app:bundleRelease"));
  assert.ok(p.calls[1].command.endsWith(join("android", "gradlew")));
  assert.equal(p.calls[1].cwd, join(p.root, "android"));
  assert.match(readFileSync(join(p.root, "android", "app", "build.gradle"), "utf8"), /System\.getenv\("ANDROID_UPLOAD_KEYSTORE_FILE"\)/);
  assert.ok(out.at(-1).includes("v1.4.2-b43.aab"));
});

test("copies the bundle to a name that carries version and build number", () => {
  const p = project();
  runBuild(p);
  const target = join(p.root, "build-output", "android", "app-v1.4.2-b43.aab");
  assert.equal(readFileSync(target, "utf8"), "bundle-bytes");
});

test("honours ARTIFACT_NAME and OUTPUT_DIR", () => {
  const p = project();
  const { code } = runBuild(p, { ARTIFACT_NAME: "my-app", OUTPUT_DIR: "dist/aab" });
  assert.equal(code, 0);
  assert.ok(existsSync(join(p.root, "dist", "aab", "my-app-v1.4.2-b43.aab")));
});

test("passes the version and signing values to the child processes", () => {
  const p = project();
  runBuild(p);
  for (const call of p.calls) {
    assert.equal(call.env.APP_VERSION, "1.4.2");
    assert.equal(call.env.APP_BUILD_NUMBER, "43");
    assert.equal(call.env.NODE_ENV, "production");
    assert.equal(call.env.ANDROID_UPLOAD_KEYSTORE_FILE, p.keystore);
    assert.equal(call.env.ANDROID_UPLOAD_KEY_PASSWORD, "key-secret");
  }
});

test("never prints a password", () => {
  const p = project();
  const { out, err } = runBuild(p);
  const everything = [...out, ...err, ...p.calls.flatMap((c) => [c.command, ...c.args])].join("\n");
  assert.ok(!everything.includes("store-secret"));
  assert.ok(!everything.includes("key-secret"));
});

test("writes the bundle path to GITHUB_OUTPUT when it is set", () => {
  const p = project();
  const outputFile = join(p.root, "github-output.txt");
  writeFileSync(outputFile, "");
  runBuild(p, { GITHUB_OUTPUT: outputFile });
  assert.match(readFileSync(outputFile, "utf8"), /^aab_path=.*app-v1\.4\.2-b43\.aab\n$/);
});

test("each required value is checked and named", () => {
  for (const name of Object.keys(buildEnv("x"))) {
    const p = project();
    const { code, err } = runBuild(p, { [name]: "" });
    assert.equal(code, 1, name);
    assert.ok(err[0].startsWith(`${name} is required`), name);
    assert.equal(p.calls.length, 0, `${name}: nothing should run`);
  }
});

test("rejects a bad build number before running anything", () => {
  for (const bad of ["0", "-3", "1.5", "abc", "99999999999999999999", String(MAX_VERSION_CODE + 1)]) {
    const p = project();
    const { code, err } = runBuild(p, { APP_BUILD_NUMBER: bad });
    assert.equal(code, 1, bad);
    assert.match(err[0], /APP_BUILD_NUMBER must be a whole number/, bad);
    assert.equal(p.calls.length, 0);
  }
});

test("rejects unsafe version and artifact names", () => {
  for (const [name, value] of [
    ["APP_VERSION", "1.0; rm -rf /"],
    ["APP_VERSION", "../1.0"],
    ["APP_VERSION", "1 0"],
    ["ARTIFACT_NAME", "../escape"],
    ["ARTIFACT_NAME", "a/b"],
  ]) {
    const p = project();
    const { code, err } = runBuild(p, { [name]: value });
    assert.equal(code, 1, `${name}=${value}`);
    assert.match(err[0], new RegExp(`${name} .* may only contain`));
    assert.equal(p.calls.length, 0);
  }
});

test("fails clearly when the Expo CLI is missing", () => {
  const p = project();
  rmSync(join(p.root, "node_modules"), { recursive: true });
  const { code, err } = runBuild(p);
  assert.equal(code, 1);
  assert.match(err[0], /Expo CLI was not found/);
  assert.equal(p.calls.length, 0);
});

test("fails clearly when the keystore file does not exist", () => {
  const p = project();
  const { code, err } = runBuild(p, { ANDROID_UPLOAD_KEYSTORE_FILE: join(p.root, "missing.jks") });
  assert.equal(code, 1);
  assert.match(err[0], /keystore file .* does not exist/);
  assert.equal(p.calls.length, 0);
});

test("stops with prebuild's exit code and does not run Gradle", () => {
  const p = project({ prebuildStatus: 3 });
  const { code } = runBuild(p);
  assert.equal(code, 3);
  assert.equal(p.calls.length, 1);
});

test("stops when prebuild produced no Gradle project", () => {
  const p = project({ prebuildWritesGradle: false });
  const { code, err } = runBuild(p);
  assert.equal(code, 1);
  assert.match(err[0], /did not produce/);
  assert.equal(p.calls.length, 1);
});

test("stops before Gradle when the template is not recognised", () => {
  const p = project();
  const wrapped = p.run;
  p.run = (command, args, options) => {
    const result = wrapped(command, args, options);
    if (args.includes("prebuild")) {
      writeFileSync(join(p.root, "android", "app", "build.gradle"), "android { }");
    }
    return result;
  };
  const { code, err } = runBuild(p);
  assert.equal(code, 1);
  assert.match(err[0], /template may have changed/);
  assert.equal(p.calls.length, 1);
});

test("returns Gradle's exit code and copies nothing when the build fails", () => {
  const p = project({ gradleStatus: 7 });
  const { code } = runBuild(p);
  assert.equal(code, 7);
  assert.ok(!existsSync(join(p.root, "build-output")));
});

test("fails when Gradle succeeds but produces no bundle", () => {
  const p = project({ gradleMakesBundle: false });
  const { code, err } = runBuild(p);
  assert.equal(code, 1);
  assert.match(err[0], /Expected build artifact was not found/);
});

test("a command that cannot start is reported and fails", () => {
  const p = project();
  p.run = () => ({ error: new Error("spawn ENOENT"), status: null });
  const { code, err } = runBuild(p);
  assert.notEqual(code, 0);
  assert.match(err.join("\n"), /spawn ENOENT/);
});

test("honours GRADLE_JVM_ARGS", () => {
  const p = project();
  runBuild(p, { GRADLE_JVM_ARGS: "-Xmx2048m" });
  assert.ok(p.calls[1].args.includes("-Dorg.gradle.jvmargs=-Xmx2048m"));
});

test("the default Gradle memory settings are used otherwise", () => {
  const p = project();
  runBuild(p);
  assert.ok(p.calls[1].args.includes("-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"));
  assert.ok(p.calls[1].args.includes("--no-daemon"));
});
