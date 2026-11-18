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
   It stops straight away, before writing anything, unless it was started from the default branch. The full ref is compared, so a tag with the same name does not count.
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
6. The pull request is still open, and GitHub's event log for it shows no force-push (`head_ref_force_pushed`), no restored branch (`head_ref_restored`) and no reopen (`reopened`). A legitimate request never has any of these. If the log cannot be read, the check fails.
7. Exactly one request file is found on the pull request.
8. The request file has `app`, `track`, `requested_by`, and `commit`.
9. Exactly one commit touches the request file, that commit is the PR's head commit, and it is based on the source commit recorded in the request file. The request commit is bound to the trusted source commit via its parent SHA, not via commit-author attribution. Commit author names or email are never used as producer authentication.
10. The requester is read from the request run's record in the Actions API, not trusted from the file. The run id is the last part of the branch name. The run must be a manual run of `release-request.yml` on the default branch at the recorded source commit, and the person who started it must match `requested_by` in the file.
11. The approved commit changes the request file and no other file.
12. `app` and `track` are on the fixed lists, read from the default branch.
13. The review carries a commit id, and it is the PR's exact head commit (`github.event.review.commit_id == HEAD_SHA`). A missing id fails. This prevents approvals submitted against older commits from releasing unreviewed changes.
14. The approval records the PR's head SHA.
15. The publish job re-verifies, right before it publishes, that the PR's head SHA has not changed since approval ("dismiss stale approvals"), that the request is still open, and that its event log still shows no force-push, restore or reopen. This also covers a rerun of failed jobs, which skips the approval check.
16. The approver is not the person who started the request run (the requester).

Rules for failure:

- If any check fails, nothing is published, and a comment on the pull request says which check failed.
- Anything unreadable or missing counts as a failure. The gate fails closed.
- A GitHub API read that fails is a plain refusal. It never closes a request: only a successful read that shows tampering does.
- Cleanup of a tampered request treats "branch not found" as done. Any other failure to look the branch up fails the run, so cleanup is never silently incomplete.
- **Refusals that mean the request itself cannot be trusted** (an extra or replaced commit, a force-push, restored branch or reopen in the event log, a requester in the file that does not match the request run, an extra changed file, a malformed request file): the request pull request is closed, its branch is deleted, and the run is shown as failed (red).
- **Refusals about people or timing** (not an approver, self-approval, a stale review, a closed request, an app or track not on the lists): the request stays as it is and the run stays green, because another approver can still approve a request that is fine. The comment on the pull request is the verdict.

When every check passes, Approve calls Publish with the app, the track, the requester, the approver and the pull request link.

After Publish finishes:

- **Success:** comment, close the request pull request, delete its branch.
- **Failure:** comment, and leave the pull request open with its branch. The approval was valid, so re-running the failed run (same approval, same commit) is allowed and needs no new approval. This holds only while the request is still open and unchanged. If it was closed or changed, the publish guard refuses it for good and a new request is needed. The comment says which case applies.

### 3. Publish (`_publish.yml`)

1. Its only trigger is `workflow_call`. It cannot be started by a push, a pull request or the manual-run button.
2. It is the only workflow that may use store or signing credentials.
3. Before it builds, and again right before it publishes, it checks that the request is unchanged, open and clean (see Approve rule 15). The second check covers a request closed while the build runs.
4. In this template it is a dry run: it builds the sample artifact and prints what it would upload. Template users replace that step with their real store upload.

## Supporting rules

- **Trigger guard.** Normal CI fails if `_publish.yml` has any trigger other than `workflow_call`.
- **Approver list lives in the workflow file.** It is not read from `CODEOWNERS` at run time, so changing who may approve is always a visible change to a workflow.
- **Inputs are data, not code.** Values typed by a person are passed to scripts as environment variables and never pasted into script text.
- **One approval run at a time per pull request.** A second approval waits for the first run, including its close step, and then finds a closed request. Two quick approvals publish once. Every waiting run is kept (`queue: max`), so a later comment review cannot replace a waiting approval.
- **Workflow check.** CI fails on a repeated YAML key or a shell syntax error in any `run:` step (`scripts/check-workflows.rb`).
- **Permissions.** The Approve check job needs `actions: read` to read the request run record. Without it, GitHub answers with HTTP 403 and every honest approval is refused.
- **Merge notice.** If someone merges a request pull request, a comment explains that merging publishes nothing and that the request needs an approval instead.

## What the gate stops

- A release caused by a merge.
- One person requesting and approving their own release.
- A person opening their own pull request into the gate branch with a hand-written request file. It is ignored because the automation did not open it.
- An approval from someone who is not on the approver list.
- A request file that was modified after the PR was opened (the "fake requester" attack), caught by the single-request-file-commit, PR-head and parent-source-commit checks.
- A force-pushed replacement of the request commit with a forged requester. The event log shows the force-push, and the requester comes from the request run record, not the file.
- Extra files carried in the approved commit.
- Replay: a closed request cannot be approved, and a request whose branch was restored or whose pull request was reopened is refused and closed.

## Known limits

These are not solved by the workflows alone. The README explains the settings that close them.

1. **Write access to the repository is still powerful.** Someone who can push branches can push a workflow of their own. If store credentials are plain repository secrets, that workflow can read them. The fix is to keep those credentials in a GitHub Environment with its own access rules.
2. **Request integrity rests on GitHub's own records, not on the request file.** The requester comes from the request run record, the pull request must be open with no force-push, restore or reopen in its event log, exactly one commit may touch the request file (based on the recorded source commit), and that commit may change only the request file. Scratch-repo tests with two accounts showed appended commits, force-pushed replacements and replay of a closed request all refused. These checks do not use commit-author text or signatures: a Verified badge only shows that someone with a registered key signed the commit, not that the automation wrote it. A branch ruleset on `release-request/**` that blocks force-pushes is still the stronger control on repositories that can use one.
3. **The Approve workflow runs from the pull request's merge ref.** GitHub's documentation says review-triggered runs use the pull request's merge commit, so the same ruleset in point 2 also protects the Approve workflow itself from being edited on a request branch.
4. **The approver list is only as safe as the workflow file.** Require a code-owner review for changes under `.github/workflows/`.
5. **The event log is read at approval time.** An event written a moment after the check starts reading would be missed. In scratch tests, four back-to-back force-push-then-approve attempts were all refused, which is a small sample and not a guarantee.
