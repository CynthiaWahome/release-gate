# build-number-sync

Reports a released build/version payload to one or more configured backend endpoints after a successful publish.

[← Back to add-ons](../README.md)

## What it does

`publish-build-number.mjs` POSTs a JSON payload to each configured HTTPS endpoint so downstream systems (for example an in-app update check) can learn which build was released.

- **Safe by default:** if `BUILD_NUMBER_SYNC_URLS` is empty or unset, it prints a skip message, makes no requests, and exits 0.
- **When configured:** it requires `BUILD_NUMBER_SYNC_URLS` (comma/space/newline-separated HTTPS URLs), `BUILD_NUMBER_SYNC_PAYLOAD` (a JSON object), and `BUILD_NUMBER_SYNC_KEY` (sent in `BUILD_NUMBER_SYNC_KEY_HEADER`, default `X-Build-Number-Key`).
- It retries network errors and 5xx responses, does not retry 4xx responses (including detected WAF challenge pages), attempts every configured endpoint, and exits non-zero if any endpoint fails. It never prints secret values.

## Needs

- **Variables:** none required. `BUILD_NUMBER_SYNC_URLS`, `BUILD_NUMBER_SYNC_PAYLOAD`, `BUILD_NUMBER_SYNC_KEY_HEADER` (default `X-Build-Number-Key`), `BUILD_NUMBER_SYNC_ATTEMPTS` (default `3`), and `BUILD_NUMBER_SYNC_RETRY_MS` (default `3000`) are runtime inputs, typically provided via workflow/env configuration.
- **Secrets:** `BUILD_NUMBER_SYNC_KEY` (required when URLs are configured). Only the publish workflow may reference it.
- **Packages:** none.
- **Other add-ons:** none. Commonly used after a successful upload/publish step (for example with [`play-upload`](../play-upload/README.md)).

## Wire it in

1. Copy `files/scripts/publish-build-number.mjs` to `scripts/publish-build-number.mjs` in your repository.
2. In `.github/workflows/_publish.yml`, add an opt-in step after the publish/upload succeeds:

   ```yaml
         - name: Sync build number
           if: ${{ success() && vars.BUILD_NUMBER_SYNC_URLS != '' }}
           env:
             BUILD_NUMBER_SYNC_URLS: ${{ vars.BUILD_NUMBER_SYNC_URLS }}
             BUILD_NUMBER_SYNC_PAYLOAD: ${{ toJson(fromJson(format('{{"app":"{0}","track":"{1}","build":{2}}}', inputs.app, inputs.track, steps.version.outputs.version_code))) }}
             BUILD_NUMBER_SYNC_KEY: ${{ secrets.BUILD_NUMBER_SYNC_KEY }}
             BUILD_NUMBER_SYNC_KEY_HEADER: X-Build-Number-Key
           run: node scripts/publish-build-number.mjs
   ```

   Adjust the payload to match your backend contract. Keep `_publish.yml` as `workflow_call` only and keep all credentials in the publish workflow/environment. Consider a hard failure (default) if a stale backend version would be harmful.

## Safe by default

- No configured URLs: no requests are made.
- Only HTTPS URLs are accepted when configured.
- Missing/invalid payload, key, or URL configuration fails with a clear error before/when syncing.
- Secret values are never printed.

## How it was tested

Against a local fake HTTP server (no real backend, no network):

```bash
addons/build-number-sync/tests/run.sh
# or
node --test addons/build-number-sync/tests/build-number-sync.test.mjs
```

The tests cover skip/no-op behavior, config validation, HTTPS enforcement, successful posts, retries on 5xx/network errors, no-retry on 4xx, WAF/challenge detection, multi-endpoint failure reporting, header/payload delivery, and CLI behavior.

**Not tested:** any real backend endpoint, authentication scheme beyond the configured header, or an end-to-end wired `_publish.yml` flow. Verify once against your real endpoint(s) before relying on it.

## Why it exists

A release can succeed at the store while downstream systems still believe an older build is current. A small, opt-in sync step makes that state update explicit, automatable, and testable as part of the release-gate template.
