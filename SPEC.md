# Release gate: specification

This file states what the gate must do, in plain English. The workflows are built from it. If a workflow and this file disagree, one of them has a bug.

## Goal

Publishing an app to a store must need two different, named people: one who requests the release and one who approves it. A merge must never publish anything.

## Words used here

- **Request**: a small JSON file saying which app to release, to which store track, and who asked.
- **Request pull request**: the pull request that carries one request file.
- **Gate branch**: a branch named `release-gate`. Request pull requests target it. Nothing is ever meant to be merged into it.
- **Automation**: the `github-actions[bot]` account that GitHub Actions acts as.
- **Approver list**: the fixed list of GitHub logins allowed to approve a release.

## The three workflows

### 1. Request (`release-request.yml`)

1. A person starts it by hand and chooses an app and a track.
2. It checks both values against fixed lists. Anything else stops the run.
3. It writes `release-requests/<id>.json` with `app`, `track`, `requested_by` (the person who started the run) and `requested_at`.
4. It pushes that file on a new branch named `release-request/<id>`.
5. The automation opens a pull request from that branch into the gate branch.
6. It builds nothing and publishes nothing.

### 2. Approve (`release-approve.yml`)

Runs when a review is submitted on any pull request. It continues only when **all** of these are true:

1. The pull request targets the gate branch.
2. The review is an approval (not a comment, not a change request).
3. The pull request was opened by the automation.
4. The pull request's branch name starts with `release-request/`.
5. The approver is on the approver list.
6. Exactly one request file is found on the pull request.
7. The request file has `app`, `track` and `requested_by`, and `app` and `track` are on the fixed lists.
8. The approver is not the person named in `requested_by`.

Rules for failure:

- If any check fails, nothing is published, and a comment on the pull request says which check failed.
- Anything unreadable or missing counts as a failure. The gate fails closed.

When every check passes, Approve calls Publish with the app, the track, the requester, the approver and the pull request link.

After Publish finishes:

- **Success:** comment, close the request pull request, delete its branch.
- **Failure:** comment, and leave the pull request open with its branch. The approval was valid, so re-running the failed run (same approval, same commit) is allowed and needs no new approval.

### 3. Publish (`_publish.yml`)

1. Its only trigger is `workflow_call`. It cannot be started by a push, a pull request or the manual-run button.
2. It is the only workflow that may use store or signing credentials.
3. In this template it is a dry run: it builds the sample artifact and prints what it would upload. Template users replace that step with their real store upload.

## Supporting rules

- **Trigger guard.** Normal CI fails if `_publish.yml` has any trigger other than `workflow_call`.
- **Approver list lives in the workflow file.** It is not read from `CODEOWNERS` at run time, so changing who may approve is always a visible change to a workflow.
- **Inputs are data, not code.** Values typed by a person are passed to scripts as environment variables and never pasted into script text.
- **Merge notice.** If someone merges a request pull request, a comment explains that merging publishes nothing and that the request needs an approval instead.

## What the gate stops

- A release caused by a merge.
- One person requesting and approving their own release.
- A person opening their own pull request into the gate branch with a hand-written request file. It is ignored because the automation did not open it.
- An approval from someone who is not on the approver list.

## Known limits

These are not solved by the workflows alone. The README explains the settings that close them.

1. **Write access to the repository is still powerful.** Someone who can push branches can push a workflow of their own. If store credentials are plain repository secrets, that workflow can read them. The fix is to keep those credentials in a GitHub Environment with its own access rules.
2. **A request branch can be pushed to.** A person with write access could add a commit to an automation-opened request branch and change the request file. Restrict who can push to `release-request/**` with a branch ruleset.
3. **The Approve workflow runs from the pull request's merge ref.** GitHub's documentation says review-triggered runs use the pull request's merge commit, so the same ruleset in point 2 also protects the Approve workflow itself from being edited on a request branch.
4. **The approver list is only as safe as the workflow file.** Require a code-owner review for changes under `.github/workflows/`.
