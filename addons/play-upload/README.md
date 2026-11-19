# play-upload

Validates and optionally gates uploading a built Android App Bundle to Google Play from the publish workflow.

[← Back to add-ons](../README.md)

## What it does

`check-play-upload.mjs` is a guard you run before any real upload step:

- **Safe by default:** if `PLAY_UPLOAD_ENABLED` is not exactly `true` (case-insensitive), it prints a skip message and exits 0 without checking credentials or files. No upload is performed.
- **When enabled:** it requires a valid Android package name (`ANDROID_PACKAGE_NAME`), a track (`PLAY_STORE_TRACK`), an existing `AAB_PATH`, and a `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON` secret that looks like a Google service account key (`type=service_account` with `client_email` and `private_key`). It fails with a clear error if anything is missing or misconfigured, and never prints secret values.

This add-on provides the validation/opt-in guard and wiring guidance. The actual upload is performed by your chosen uploader step (for example `r0adkll/upload-google-play`) in `_publish.yml`, and must run only when explicitly enabled.

## Needs

- **Variables:** `PLAY_UPLOAD_ENABLED` (`"true"` to allow upload; anything else/unset disables it), `ANDROID_PACKAGE_NAME`, `PLAY_STORE_TRACK`.
- **Secrets:** `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON` (Google Play service account key). Only the publish workflow may reference it.
- **Packages:** none required by the check script. A real upload step may require an action/tool such as `r0adkll/upload-google-play`.
- **Other add-ons:** [`aab-build`](../aab-build/README.md) to produce the `.aab` and expose its path.

## Wire it in

1. Copy `files/scripts/check-play-upload.mjs` to `scripts/check-play-upload.mjs` in your repository.
2. Set repository variable `PLAY_UPLOAD_ENABLED` to `true` only when you intend to allow uploads. Leave it unset/`false` to keep uploads off.
3. In `.github/workflows/_publish.yml`, after the build step has produced an AAB (and set `aab_path`/`AAB_PATH`), add a guarded check and upload:

   ```yaml
         - name: Check Play upload configuration
           if: vars.PLAY_UPLOAD_ENABLED == 'true'
           env:
             PLAY_UPLOAD_ENABLED: ${{ vars.PLAY_UPLOAD_ENABLED }}
             ANDROID_PACKAGE_NAME: ${{ vars.ANDROID_PACKAGE_NAME }}
             PLAY_STORE_TRACK: ${{ vars.PLAY_STORE_TRACK }}
             AAB_PATH: ${{ steps.build_aab.outputs.aab_path }}
             PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: ${{ secrets.PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON }}
           run: node scripts/check-play-upload.mjs

         - name: Upload to Google Play
           if: vars.PLAY_UPLOAD_ENABLED == 'true'
           uses: r0adkll/upload-google-play@e738b9dd8f2476ea806d921b64aacd24f34515a5 # v1.1.5
           with:
             serviceAccountJsonPlainText: ${{ secrets.PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON }}
             packageName: ${{ vars.ANDROID_PACKAGE_NAME }}
             releaseFiles: ${{ steps.build_aab.outputs.aab_path }}
             track: ${{ vars.PLAY_STORE_TRACK }}
             status: completed
   ```

   Keep `_publish.yml` as `workflow_call` only (the publish trigger must not change). Keep all credentials in the publish workflow/environment. Adjust `releaseFiles`, `status`, `whatsNewDirectory`, or track handling to match your release process.

### Order matters

- **Keep the upload the last step.** In this template's `_publish.yml`, the step "Mark that the upload is about to start" sits just before the upload. Put the upload where the **Publish (dry run)** step is, right after that marker, and add nothing after it. If a step failed after a real upload, the job would look failed while the release is already out. The approval gate closes the request in that case, so a re-run cannot release again (see "After Publish finishes" in [SPEC.md](../../SPEC.md)).
- **`status: completed` releases to the track immediately,** so a repeated upload is a second release. After a late failure, check Play Console before you start a new request.
- **Anything that must follow the upload** (for example [`build-number-sync`](../build-number-sync/README.md)) must be non-fatal (`continue-on-error: true`). It must never be able to fail the publish job. A second job in the same workflow is not enough: the approval gate judges the whole publish workflow, so a failing second job would still close the request.
- **Pin the action to a full commit SHA,** as in the snippet. This template's CI fails on a step that uses a version tag.

## Safe by default

- Uploads are disabled unless `PLAY_UPLOAD_ENABLED` is explicitly `true`.
- When disabled, the check exits 0 without contacting Google Play or requiring secrets/files.
- When enabled but misconfigured, the check fails before the upload step runs.
- Credentials are never printed by the check script.

## How it was tested

Against fake environment/inputs and a temporary file (no network, no real Play API):

```bash
addons/play-upload/tests/run.sh
# or
node --test addons/play-upload/tests/check-play-upload.test.mjs
```

The tests cover disabled/opt-in gating, required-input and package/track/path validation, service-account JSON shape checks, no secret leakage on failure, and CLI behavior.

**Not tested:** a real upload to Google Play, real service-account permissions, or an end-to-end wired `_publish.yml` run. Verify once in CI against a real app/track with valid credentials before relying on it.

## Why it exists

Building an AAB is separate from publishing it. A guarded, opt-in upload step lets teams keep the gate/template safe by default while making the real Play upload explicit, reviewable, and easy to enable when ready.
