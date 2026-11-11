<h1 align="center">Release Gate</h1>

<p align="center">
  <b>One person requests. Another approves. Merging is not a release strategy.</b>
</p>

<br>

![Status](https://img.shields.io/badge/status-in%20development-F5A623?style=for-the-badge)
![Visibility](https://img.shields.io/badge/visibility-private-EB5757?style=for-the-badge)

[![CI](https://img.shields.io/github/actions/workflow/status/wamziliary/rn-release-gate/ci.yml?branch=dev&label=CI&logo=githubactions&logoColor=white&style=for-the-badge)](https://github.com/wamziliary/rn-release-gate/actions/workflows/ci.yml)
[![Secret scan](https://img.shields.io/github/actions/workflow/status/wamziliary/rn-release-gate/security.yml?branch=dev&label=secret%20scan&logo=githubactions&logoColor=white&style=for-the-badge)](https://github.com/wamziliary/rn-release-gate/actions/workflows/security.yml)

[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-template-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](#make-it-yours)
[![Expo / React Native](https://img.shields.io/badge/Expo%20%2F%20React%20Native-release%20gate-000020?style=for-the-badge&logo=expo&logoColor=white)](#what-you-get)
[![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)](#what-you-get)
[![Google Play](https://img.shields.io/badge/Google%20Play-414141?style=for-the-badge&logo=googleplay&logoColor=white)](#what-you-get)
[![iOS / TestFlight](https://img.shields.io/badge/iOS%20%2F%20TestFlight-000000?style=for-the-badge&logo=apple&logoColor=white)](#what-you-get)
[![Release approval](https://img.shields.io/badge/release-two--person%20approval-8A2BE2?style=for-the-badge)](SPEC.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-00A86B?style=for-the-badge)](LICENSE)

<br>

A GitHub Actions release-approval template extracted from a working React Native / Expo setup. Someone requests a release, a different authorised person approves it, and only then can the publishing workflow run.

<br>

> [!IMPORTANT]
> **Born from production reality:** Forged from a real-world Poisoned Pipeline Execution (PPE) incident (OWASP CI/CD Top 10) where an attacker used a compromised credential to inject a rogue workflow and attempt to exfiltrate signing keys. In mobile CI/CD, a single token should never have the power to deploy backdoored binaries to user devices. Two authorized humans must sign off—always.  
> [Read the full threat model & retrospective →](THREAT_MODEL.md)

<br>

---

## What you get

- **Manual release requests:** Request releases with app and store-track choices via `workflow_dispatch`.
- **Automated audit trails:** An automation-created pull request records every request.
- **Named approvers & anti-self-approval:** Enforces independent peer reviews before publishing.
- **Protected publishing pipeline:** A reusable publishing workflow reached only through the approval gate.
- **CI trigger guards:** Automated checks that fail if a direct publish trigger is accidentally added.
- **Clean state management:** Auto-closes requests after success, leaving failed requests open for debugging.

The approval mechanism is modular and reusable beyond React Native, too.

<br>

---

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

<br>

> **Bring your own app; keep the gate.**  
> This template includes a sample build and a dry-run publishing step. It produces a text artifact—not an APK, AAB, or IPA—and uploads nothing to an app store. No surprise production releases included.

<br>

---

## Make it yours

1. **Start a repository** with **Use this template**, or bring the gate into your existing app.
2. **Configure your repository reference, approvers, apps, and tracks.**
3. **Give Actions the required access** and configure code owners before enforcing reviews.
4. **Try the included dry run**, then connect your real build and store upload.

Follow [SETUP.md](SETUP.md) for both adoption routes, exact file changes, permissions, and the first-run checklist.

<br>

> **Avoid locking yourself out:**  
> Add another eligible code owner with write access **before requiring code-owner approval**. PR authors cannot approve their own PRs.  
> [Ownership setup and recovery considerations →](SETUP.md#5-configure-code-owners-before-enforcing-reviews)

<br>

---

## Using the gate

### 1. Request a release

Open **Actions → Release 1: Request → Run workflow**, select the intended branch, app, and track, then run it. The bot opens a PR into `release-gate`; ask an authorised reviewer to review it.

<br>

### 2. Approve a release

A different authorised person opens the request PR and submits **Review changes → Approve**. The gate checks the request before calling the publish workflow.

<br>

> **Do not merge the request PR.**  
> `release-gate` is an isolated holding branch for release requests—not somewhere you merge application changes. This is an approval queue, not a merge queue wearing a different hat.

- **Success:** The workflow closes the request and deletes its branch.
- **Failure:** The request stays open. Inspect the logs and store state before rerunning.
- **Changed your mind?** Close an unapproved request without merging it.

<br>

---

## Before production

Before connecting real store credentials and upload targets:

- **Protect workflows & branches:** Protect the workflow files, request branches, and store credentials.
- **Define source revision:** Define the exact source revision to build (the request records a commit, but ensure your custom publish step checks out that recorded commit).
- **Enforce repository rulesets:** The gate compares GitHub accounts; independent approval requires a different human. Pair this workflow with GitHub environment and branch protection rules.

See the [production checklist](SETUP.md#before-you-give-it-the-store-keys) before enabling real uploads.

<br>

---

## Documentation

- [Setup guide](SETUP.md): Adoption, permissions, workflow reference, testing, and local checks.
- [Specification](SPEC.md): The exact gate rules and known limits.

<br>

---

## License

MIT. See [LICENSE](LICENSE).

<br>

---

<p align="center">
  <b>Call us old-fashioned</b> <img src="https://res.cloudinary.com/cycy/image/upload/v1794422080/tlbwyleiin7zpohuotf9.png" width="45" height="44" align="absmiddle" alt="adjusts glasses" /><br>
  We just think shipping a broken binary to thousands of devices... <img src="https://res.cloudinary.com/cycy/image/upload/v1794423065/bzdnlaiqlf6t0vgbdqx4.png" width="56" height="44" align="absmiddle" alt="shades" /><br>
  Should take two people agreeing it's a good idea <a href="https://github.com/CynthiaWahome"><img src="https://res.cloudinary.com/cycy/image/upload/v1794422081/lamllkkir4ch4kgdvxne.gif" width="44" height="44" align="absmiddle" alt="wamzy" /></a>
</p>
