# Add-ons

Optional pieces that sit on top of the core gate. The core (the three release workflows, the trigger guard and the dry-run publish) works on its own and stays safe by default. Add-ons are what you copy in when you want the real release machinery.

[← Back to the overview](../README.md)

## Rules every add-on follows

1. **Self-contained.** One folder per add-on, with everything it needs inside it.
2. **Safe by default.** Nothing an add-on adds may upload to a store unless you opt in. Real uploads stay off until a repository variable says otherwise.
3. **Credentials stay in the publish workflow.** Store and signing secrets may only be referenced from `_publish.yml`, as the core already requires. An add-on that needs a secret says so in its README and manifest.
4. **No app names.** Package IDs, bucket names and URLs are inputs, never hard-coded.
5. **The publish trigger never changes.** An add-on must not add a trigger to `_publish.yml`. The trigger guard fails the build if one appears.
6. **Honest about testing.** Each README states whether the add-on has only been tested against a fake or against the real service.

## Layout

```text
addons/
  README.md              this file
  _template/             copy this to start a new add-on
    README.md            what it does, how to wire it in, how to test it
    addon.json           the manifest (see below)
    files/               everything the add-on copies into a repository
  <add-on-name>/         the same shape for each real add-on
```

Folders that start with an underscore are not add-ons.

## The manifest

Each add-on has an `addon.json` describing what it does to a repository. Humans read it today. An installer can read it later, so keep it accurate.

| Field | Meaning |
|---|---|
| `name` | The folder name, in lowercase with hyphens |
| `summary` | One sentence describing what it adds |
| `status` | `planned`, `experimental` or `stable` |
| `tested` | `none`, `fake` (against a stand-in service) or `live` (against the real one) |
| `requires.variables` | Repository variables it reads, with what each one does |
| `requires.secrets` | Secret names it reads, by name only, never values |
| `requires.addons` | Other add-ons it depends on |
| `copies` | Files copied as they are, as `{ "from": "files/...", "to": "..." }` |
| `patches` | Edits to files the core already has, as `{ "file": "...", "change": "..." }` |

Prefer `copies` over `patches`. A patch means editing a file you may have customised, so an add-on should add a separate file and call it from a single, clearly marked step instead.

## Available add-ons

| Add-on | What it adds | Status |
|---|---|---|
| [`runner-fallback`](runner-fallback/README.md) | Pick the runner from a repository variable, falling back to a hosted one | experimental |
| [`disk-cleanup`](disk-cleanup/README.md) | Free runner disk space before a heavy native build, and fail fast if too little is left | experimental |
| `play-version-code` | Ask Google Play for the highest existing `versionCode` so the next build can use one more | planned |
| `aab-build` | Build a signed Android App Bundle | planned |
| `play-upload` | Upload the bundle to Google Play | planned |
| `build-number-sync` | Report the released version to a backend endpoint, if one is configured | planned |

## Testing

`scripts/test-addons.sh` runs `addons/*/tests/run.sh` for every add-on that has one, and CI runs it on every pull request. Tests use the real scripts against fakes, so they prove the logic, not the real service. Each README says what is still untested.

## Adding a new add-on

1. Copy `_template/` to `addons/<your-add-on-name>/`.
2. Fill in `addon.json` and the README. Put the files it copies under `files/`.
3. Add tests in `tests/run.sh`, check it against the rules above, and run `scripts/test-addons.sh`. A passing suite should be able to fail: break something on purpose and confirm a test notices.
4. Open a PR using the repository template, and say how you tested it.
