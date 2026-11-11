# Release Gate

**One person requests. Another approves. Merging is not a release strategy.**

![Status](https://img.shields.io/badge/status-in%20development-F5A623?style=for-the-badge)
![Visibility](https://img.shields.io/badge/visibility-private-EB5757?style=for-the-badge)

[![CI](https://img.shields.io/github/actions/workflow/status/wamziliary/rn-release-gate/ci.yml?branch=dev&label=CI&logo=githubactions&logoColor=white&style=for-the-badge)](https://github.com/wamziliary/rn-release-gate/actions/workflows/ci.yml)
[![Secret scan](https://img.shields.io/github/actions/workflow/status/wamziliary/rn-release-gate/security.yml?branch=dev&label=secret%20scan&logo=githubactions&logoColor=white&style=for-the-badge)](https://github.com/wamziliary/rn-release-gate/actions/workflows/security.yml)

[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-template-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](#make-it-yours)
[![Expo / React Native](https://img.shields.io/badge/Expo%20%2F%20React%20Native-release%20gate-000020?style=for-the-badge&logo=expo&logoColor=white)](#what-you-get)
[![Release approval](https://img.shields.io/badge/release-two--person%20approval-8A2BE2?style=for-the-badge)](SPEC.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-00A86B?style=for-the-badge)](LICENSE)

A GitHub Actions release-approval template extracted from a working React Native / Expo setup. Someone requests a release, a different authorised person approves it, and only then can the publishing workflow run.

> **Bring your own app; keep the gate.** This template includes a sample build and a dry-run publishing step. It produces a text artifact—not an APK, AAB, or IPA—and uploads nothing to an app store. No surprise production releases included.

## What you get

- A manual release request with app and store-track choices.
- An automation-created pull request that records the request.
- Named release approvers and a self-approval check.
- A reusable publishing workflow reached through the approval workflow.
- A CI guard against adding another publishing trigger.
- Request cleanup after success, with the request left open after failure.

The approval mechanism is reusable beyond React Native, too.

## How it works

```mermaid
flowchart TD
    A[Person A runs Release 1: Request] --> B[Automation opens a PR into release-gate]
    B --> C[Person B submits an approving review]
    C --> D{Approval checks pass?}
    D -->|No| E[Publishing stays locked]
    D -->|Yes| F[Call Release 3: Publish]
    F --> G{Publish succeeds?}
    G -->|Yes| H[Close the PR and delete its branch]
    G -->|No| I[Keep the request open for investigation]
```

`release-gate` is a holding branch for release requests—not somewhere you merge application changes.

## Make it yours

1. **Start a repository** with **Use this template**, or bring the gate into your existing app.
2. **Configure your repository reference, approvers, apps, and tracks.**
3. **Give Actions the required access** and configure code owners before enforcing reviews.
4. **Try the included dry run**, then connect your real build and store upload.

Follow [SETUP.md](SETUP.md) for both adoption routes, exact file changes, permissions, and the first-run checklist.

> **Avoid locking yourself out:** add another eligible code owner with write access **before requiring code-owner approval**. PR authors cannot approve their own PRs. [Ownership setup and recovery considerations →](SETUP.md#5-configure-code-owners-before-enforcing-reviews)

## Using the gate

### Request a release

Open **Actions → Release 1: Request → Run workflow**, select the intended branch, app, and track, then run it. The bot opens a PR into `release-gate`; ask an authorised reviewer to review it.

### Approve a release

A different authorised person opens the request PR and submits **Review changes → Approve**. The gate checks the request before calling the publish workflow.

**Do not merge the request PR.** This is an approval queue, not a merge queue wearing a different hat.

- **Success:** the workflow closes the request and deletes its branch.
- **Failure:** the request stays open. Inspect the logs and, for real uploads, the store state before rerunning—a failed job does not guarantee nothing was uploaded.
- **Changed your mind?** Close an unapproved request without merging it.

## Before production

Protect the workflow files, request branches, and store credentials. Also define the exact source revision to build: the request records a commit, but the sample publish workflow does not explicitly check out that recorded commit.

The gate compares GitHub accounts; independent approval still requires a different human. Repository write access remains powerful, so the workflow is not a substitute for repository and environment protections.

See the [production checklist](SETUP.md#before-you-give-it-the-store-keys) before enabling real uploads.

## Documentation

- [Setup guide](SETUP.md): adoption, permissions, workflow reference, testing, and local checks.
- [Specification](SPEC.md): the exact gate rules and known limits.

## License

MIT. See [LICENSE](LICENSE).

---

<p align="center">
  <b>Call us old-fashioned</b> <img src="https://res.cloudinary.com/cycy/image/upload/v1794422080/tlbwyleiin7zpohuotf9.png" width="22" height="22" alt="adjusts glasses" style="vertical-align: middle;" /><br>
  We just think shipping a broken binary to thousands of devices should take two people agreeing it's a good idea <a href="https://github.com/CynthiaWahome"><img src="https://res.cloudinary.com/cycy/image/upload/v1794422081/lamllkkir4ch4kgdvxne.gif" width="22" height="22" alt="wamzy" style="vertical-align: middle;" /></a>
</p>
