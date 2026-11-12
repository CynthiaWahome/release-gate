#!/usr/bin/env node

// Builds a signed Android App Bundle (.aab) from an Expo project.
//
// Steps: `expo prebuild` regenerates android/, the release signing config is
// patched in, Gradle builds :app:bundleRelease, and the bundle is copied to an
// output folder with a name that carries the version.
//
// Usage: node scripts/build-aab.mjs
//
// Environment (required):
//   APP_VERSION                     versionName, for example 1.4.2
//   APP_BUILD_NUMBER                versionCode, a whole number above zero
//   ANDROID_UPLOAD_KEYSTORE_FILE    path to the keystore file
//   ANDROID_UPLOAD_STORE_PASSWORD   its password
//   ANDROID_UPLOAD_KEY_ALIAS        the key alias
//   ANDROID_UPLOAD_KEY_PASSWORD     the key password
// Environment (optional):
//   ARTIFACT_NAME      file name prefix, default "app"
//   OUTPUT_DIR         where the bundle is copied, default build-output/android
//   GRADLE_JVM_ARGS    default "-Xmx4096m -XX:MaxMetaspaceSize=1024m"
//
// APP_VERSION and APP_BUILD_NUMBER are passed to prebuild and Gradle. Your app
// config must read them (for example in app.config.ts) to set the versionName
// and versionCode, or the bundle will not carry the numbers you chose.
//
// The signing values are only passed through the environment. They are never
// printed and never written to a file. Needs the JDK and Android SDK on the
// machine; in CI, set them up with actions/setup-java and
// android-actions/setup-android first.

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { patchBuildGradle } from "./configure-release-signing.mjs";

const REQUIRED_ENV = [
  "APP_VERSION",
  "APP_BUILD_NUMBER",
  "ANDROID_UPLOAD_KEYSTORE_FILE",
  "ANDROID_UPLOAD_STORE_PASSWORD",
  "ANDROID_UPLOAD_KEY_ALIAS",
  "ANDROID_UPLOAD_KEY_PASSWORD",
];

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const MAX_VERSION_CODE = 2_100_000_000;

function realRun(command, args, { cwd, env }) {
  return spawnSync(command, args, { cwd, env, stdio: "inherit" });
}

/**
 * Returns the process exit code. Everything it needs from outside is passed in,
 * so tests can supply a fake runner and a temporary project folder.
 */
export function main({
  env = process.env,
  cwd = process.cwd(),
  run = realRun,
  out = (line) => console.log(line),
  err = (line) => console.error(line),
} = {}) {
  for (const name of REQUIRED_ENV) {
    if (!env[name] || !String(env[name]).trim()) {
      err(`${name} is required.`);
      return 1;
    }
  }

  const version = String(env.APP_VERSION).trim();
  if (!SAFE_NAME.test(version)) {
    err(
      `APP_VERSION "${version}" may only contain letters, numbers, dots, dashes and underscores.`,
    );
    return 1;
  }

  const buildNumberText = String(env.APP_BUILD_NUMBER).trim();
  const buildNumber = Number(buildNumberText);
  if (
    !/^\d+$/.test(buildNumberText) ||
    !Number.isSafeInteger(buildNumber) ||
    buildNumber < 1 ||
    buildNumber > MAX_VERSION_CODE
  ) {
    err(
      `APP_BUILD_NUMBER must be a whole number from 1 to ${MAX_VERSION_CODE}, got "${buildNumberText}".`,
    );
    return 1;
  }

  const artifactName = (env.ARTIFACT_NAME ?? "app").trim() || "app";
  if (!SAFE_NAME.test(artifactName)) {
    err(
      `ARTIFACT_NAME "${artifactName}" may only contain letters, numbers, dots, dashes and underscores.`,
    );
    return 1;
  }

  const projectRoot = resolve(cwd);
  const androidDirectory = join(projectRoot, "android");
  const expoCli = join(projectRoot, "node_modules", "expo", "bin", "cli");
  const buildGradlePath = join(androidDirectory, "app", "build.gradle");
  const gradlew = join(androidDirectory, "gradlew");
  const outputDirectory = resolve(
    projectRoot,
    env.OUTPUT_DIR || join("build-output", "android"),
  );

  if (!existsSync(expoCli)) {
    err(
      `Expo CLI was not found at ${expoCli}. Run npm ci first, and make sure expo is a dependency.`,
    );
    return 1;
  }

  if (!existsSync(env.ANDROID_UPLOAD_KEYSTORE_FILE)) {
    err(
      `The keystore file ${env.ANDROID_UPLOAD_KEYSTORE_FILE} does not exist. Run prepare-upload-keystore.sh first.`,
    );
    return 1;
  }

  const childEnv = {
    ...env,
    APP_VERSION: version,
    APP_BUILD_NUMBER: String(buildNumber),
    NODE_ENV: "production",
  };

  out(`Building ${artifactName} v${version} (versionCode ${buildNumber})`);

  const step = (command, args, directory) => {
    out(`\n> ${command} ${args.join(" ")}`);
    const result = run(command, args, { cwd: directory, env: childEnv });
    if (result?.error) {
      err(result.error.message);
      return result.status ?? 1;
    }
    return result?.status ?? 1;
  };

  let status = step(
    process.execPath,
    [expoCli, "prebuild", "--platform", "android", "--clean", "--no-install"],
    projectRoot,
  );
  if (status !== 0) return status;

  if (!existsSync(buildGradlePath) || !existsSync(gradlew)) {
    err(
      `expo prebuild did not produce ${buildGradlePath} and ${gradlew}. Check the prebuild output above.`,
    );
    return 1;
  }

  try {
    writeFileSync(
      buildGradlePath,
      patchBuildGradle(readFileSync(buildGradlePath, "utf8")),
    );
  } catch (error) {
    err(error.message);
    return 1;
  }

  const jvmArgs =
    env.GRADLE_JVM_ARGS?.trim() || "-Xmx4096m -XX:MaxMetaspaceSize=1024m";

  status = step(
    gradlew,
    [
      "--no-daemon",
      "--max-workers=2",
      `-Dorg.gradle.jvmargs=${jvmArgs}`,
      ":app:bundleRelease",
    ],
    androidDirectory,
  );
  if (status !== 0) return status;

  const sourceBundle = join(
    androidDirectory,
    "app",
    "build",
    "outputs",
    "bundle",
    "release",
    "app-release.aab",
  );

  if (!existsSync(sourceBundle)) {
    err(`Expected build artifact was not found at ${sourceBundle}`);
    return 1;
  }

  const outputBundle = join(
    outputDirectory,
    `${artifactName}-v${version}-b${buildNumber}.aab`,
  );
  mkdirSync(dirname(outputBundle), { recursive: true });
  copyFileSync(sourceBundle, outputBundle);

  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `aab_path=${outputBundle}\n`);
  }

  out(`\nBuilt ${outputBundle}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
