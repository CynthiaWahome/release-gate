# rn-release-gate

A GitHub Actions template for React Native / Expo apps where publishing to an app store takes **two named people**: one requests the release, a different one approves it. A merge never publishes anything.

> **Status:** the workflows pass `actionlint` and the trigger guard is tested locally. The request, approval and publish flow has **not yet been run end to end on GitHub**. Follow "First run" below before you rely on it.

## How it works

```
 Person A                      Automation                    Person B
    |                              |                             |
    |  runs "Release 1: Request"   |                             |
    |----------------------------->|                             |
    |                              |  writes release-requests/   |
    |                              |  <id>.json and opens a pull |
    |                              |  request into release-gate  |
    |                              |---------------------------->|
    |                              |                             |  reviews: Approve
    |                              |<----------------------------|
    |                              |
    |              "Release 2: Approve and publish"
    |              checks: gate branch, real approval, opened by
    |              the automation, approver on the list, one valid
    |              request file, approver is not the requester
    |                              |
    |              "Release 3: Publish" (workflow_call only)
    |              builds and publishes (dry run in this template)
```

| Workflow | File | Started by |
|---|---|---|
| Release 1: Request | `.github/workflows/release-request.yml` | a person, by hand |
| Release 2: Approve and publish | `.github/workflows/release-approve.yml` | an approving review |
| Release 3: Publish | `.github/workflows/_publish.yml` | only by Release 2 |
| Merge notice | `.github/workflows/release-gate-notice.yml` | a merged request |
| CI | `.github/workflows/ci.yml` | pull requests and pushes |
| Secret scan | `.github/workflows/security.yml` | pull requests, pushes, weekly |

The exact rules are in [`SPEC.md`](SPEC.md).

## Set up after "Use this template"

1. **Point the approval workflow at your repository.** In `release-approve.yml`, change `CynthiaWahome/rn-release-gate` in the `uses:` line to your own owner and repository, and `@dev` to your default branch.
2. **Set the approvers.** In the same file, replace `ALLOWED_APPROVERS` with your logins. You need at least two people, because nobody can approve their own request.
3. **Name your apps and tracks.** Edit `release.config.json`, and the matching `options` lists in `release-request.yml`.
4. **Let Actions open pull requests.** Settings > Actions > General > Workflow permissions > tick "Allow GitHub Actions to create and approve pull requests".
5. **Replace the placeholder app.** `scripts/build.mjs` and `package.json` stand in for a real app. Put your build command in the "Build" step of `_publish.yml`.
6. **Replace the dry run.** The "Publish (dry run)" step in `_publish.yml` is where your store upload goes. It is the only place store or signing credentials should appear.
7. **Update `CODEOWNERS`** with the people who own releases.

## First run (do this once, with two accounts)

1. Account A: Actions > **Release 1: Request** > Run workflow. A pull request into `release-gate` appears, opened by `github-actions[bot]`.
2. Account A approves it. Expected: a comment saying their own approval does not count. Nothing is published.
3. Account B (on the approver list) approves it. Expected: **Release 3: Publish** runs, the job summary shows the dry run, and the request is closed.
4. Open a new request and merge it. Expected: a comment explaining that merging does not publish.
5. On a branch, add `workflow_dispatch:` to `_publish.yml` and open a pull request. Expected: CI fails at "Guard the publish trigger".

## What it stops

- A release caused by a merge.
- One person requesting and approving their own release.
- A hand-made pull request into the gate branch with a forged request file.
- An approval from someone who is not on the list.
- A second, quiet way to start the publish workflow (CI fails if one is added).

## What it does not stop on its own

The workflows are one layer. These settings are the rest.

| Gap | Setting that closes it |
|---|---|
| Anyone who can push a branch can push their own workflow, and plain repository secrets are readable by any workflow | Keep store and signing credentials in a GitHub **Environment** with its own access rules, and reference that environment only from `_publish.yml`. Check GitHub's documentation for what your plan allows, and test how the environment's branch rules behave with review-triggered runs before relying on them |
| A person with write access could push an extra commit to a request branch | Add a branch **ruleset** that restricts pushes to `release-request/**` and `release-gate` |
| The approver list and the gate live in workflow files | Protect the default branch and require a **code-owner review** for `.github/workflows/` |
| Actions are referenced by version tag | Pin each action to a full commit SHA and let Dependabot update them |

## Local checks

```bash
npm ci
npm run lint
npm run typecheck
scripts/check-publish-trigger.sh   # must print "The publish gate is intact."
actionlint                         # if installed
```

## Licence

MIT. See [`LICENSE`](LICENSE).
