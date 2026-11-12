# play-version-code

Asks Google Play for the highest `versionCode` it already knows about, so each automated build can use the next one up.

[← Back to add-ons](../README.md)

## What it does

`get-play-version-code.mjs <packageName> [track]` looks at **every track** (internal, alpha, beta, production and any custom ones) and **every release** on them, and prints one number: the highest `versionCode` found. It prints `0` when the app has no releases yet.

Because it reads Play's own record instead of a local counter, it stays correct even if someone uploads a build to Play by hand. Google Play rejects a bundle whose `versionCode` it has already seen, so a counter that drifts breaks the release.

**Your build should use that number plus one.**

It only reads. It opens a temporary edit to read the track list, then deletes it. It changes nothing in Play Console.

STDOUT carries exactly the one number. Diagnostics go to STDERR, including every track the package has and, for the track you name, its releases and country availability. That helps when a workflow publishes to a different track than the one you are looking at in Play Console.

## Needs

- **Variables:** `ANDROID_PACKAGE_NAME`, the package to look up. If you release more than one app, give each app its own package name.
- **Secrets:** `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON`, the contents of a Google Play service account key with access to the app. Only `_publish.yml` may reference it.
- **Packages:** `googleapis`. The source project used `^174.0.1`; the current release when this was written was 189.0.0. Only `google.auth.GoogleAuth` and `google.androidpublisher({ version: "v3" })` are used, but newer versions have not been run here.
- **Other add-ons:** none.

## Wire it in

1. Copy `files/scripts/get-play-version-code.mjs` to `scripts/` in your repository.
2. Add the dependency so `npm ci` installs it from your lockfile:

   ```bash
   npm install --save-dev googleapis
   ```

3. In `.github/workflows/_publish.yml`, add this step before the **Build** step:

   ```yaml
         - name: Look up the highest Play versionCode
           env:
             PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: ${{ secrets.PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON }}
             PACKAGE_NAME: ${{ vars.ANDROID_PACKAGE_NAME }}
             TRACK: ${{ inputs.track }}
           run: |
             version_code="$(node scripts/get-play-version-code.mjs "$PACKAGE_NAME" "$TRACK")"
             echo "Highest existing Play versionCode: $version_code"
             echo "PLAY_MAX_VERSION_CODE=$version_code" >> "$GITHUB_ENV"
   ```

4. Make your build use `PLAY_MAX_VERSION_CODE + 1` as the new `versionCode`.
5. Create the service account key in Google Cloud, grant it access to the app in Play Console, and store the key as the `PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON` secret.

The values go in through `env:`, never pasted into the script text.

## Safe by default

- Read-only: it never uploads or edits anything in Play.
- It fails loudly, with a message, when the secret is missing, is not valid JSON, or Play returns anything other than "not found". It will not guess a number.
- A 404 is treated as "no releases yet" and prints `0`. Google Play returns the same 404 for a mistyped package name, so the script writes a warning to stderr when it happens. If your app already exists, check the package name.
- Until you wire it in and add the secret, nothing changes.

## How it was tested

Against a fake Google Play client, with the real script:

```bash
addons/play-version-code/tests/run.sh
```

The 25 tests check that the highest code is picked across tracks and releases, that numeric strings are compared as numbers, that non-numeric values are ignored, that only the number reaches stdout while diagnostics reach stderr, that the temporary edit is always deleted (even after an error), that 404 gives `0` with a warning, that 403 and 500 fail without printing a number, and that missing or invalid input fails before any client is created. Two more run the file directly to check the usage and missing-secret failures.

I also broke the script four ways on purpose: taking the lowest code instead of the highest, no longer tolerating a 404, printing diagnostics to stdout, and never deleting the edit. Each made tests fail, and the script was restored afterwards.

**Not tested:** anything against the real Google Play API. The fake shows the logic is right for the responses it returns, not what Google really returns, or that your service account has the right permissions. Run it once against a real app and read the stderr output before you rely on it.

## Why it exists

Play rejects an upload whose `versionCode` it has already seen, and a hand-kept counter drifts the first time someone uploads from a laptop, or a release is rolled back. Reading Play's own highest code removes that whole class of failure.
