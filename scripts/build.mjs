#!/usr/bin/env node
// Placeholder build. It stands in for a real native build so the release
// workflows have an artifact to carry. Replace it with your own build
// (for example an Expo prebuild followed by a Gradle bundle).
//
// Usage: node scripts/build.mjs <app>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../release.config.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const app = process.argv[2];

if (!app || !config.apps.includes(app)) {
  console.error(`Unknown app "${app ?? ''}". Expected one of: ${config.apps.join(', ')}`);
  process.exit(1);
}

mkdirSync('dist', { recursive: true });
const file = `dist/${app}.artifact.txt`;
writeFileSync(
  file,
  [`app=${app}`, `version=${pkg.version}`, `commit=${process.env.GITHUB_SHA ?? 'local'}`, ''].join('\n'),
);
console.log(`Built ${file}`);
