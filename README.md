<h1 align="center">Release Gate</h1>

<p align="center">
  <b>One person requests. Another approves. Merging is not a release strategy.</b>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://res.cloudinary.com/cycy/image/upload/v1794669470/release-gate-flow-dark-v2.svg">
    <img src="https://res.cloudinary.com/cycy/image/upload/v1794669474/release-gate-flow-light-v2.svg" alt="A asks to ship. B reviews. If B approves, SHIP_IT and the release ships. If there is no approval, !SHIP_IT and nothing ships." width="640">
  </picture>
</p>

<br>

[![Shell](https://img.shields.io/badge/Shell-Bash-4EAA25?style=for-the-badge&logo=gnubash&logoColor=white)](scripts/check-publish-trigger.sh)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-template-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)](SETUP.md#workflow-reference)
[![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)](#what-you-get)
[![React Native](https://img.shields.io/badge/React%20Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#what-you-get)
[![Android](https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white)](#what-you-get)
[![Google Play](https://img.shields.io/badge/Google%20Play-414141?style=for-the-badge&logo=googleplay&logoColor=white)](#what-you-get)
[![iOS / TestFlight](https://img.shields.io/badge/iOS%20%2F%20TestFlight-000000?style=for-the-badge&logo=apple&logoColor=white)](#what-you-get)
![Status](https://img.shields.io/badge/status-in%20development-F5A623?style=for-the-badge)
![Visibility](https://img.shields.io/badge/visibility-private-EB5757?style=for-the-badge)
[![CI](https://img.shields.io/github/actions/workflow/status/CynthiaWahome/release-gate/ci.yml?branch=dev&label=CI&logo=githubactions&logoColor=white&style=for-the-badge)](https://github.com/CynthiaWahome/release-gate/actions/workflows/ci.yml)
[![Secret scan](https://img.shields.io/github/actions/workflow/status/CynthiaWahome/release-gate/security.yml?branch=dev&label=secret%20scan&logo=githubactions&logoColor=white&style=for-the-badge)](https://github.com/CynthiaWahome/release-gate/actions/workflows/security.yml)
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

- **Manual release requests** with app and store-track choices.
- **Audit trail:** a bot-opened pull request records every request.
- **Two-person rule:** named approvers, and nobody approves their own release.
- **Locked publishing:** the publish workflow is reachable only through the approval gate.
- **Trigger guard:** CI fails if a direct publish trigger is ever added.

<br>

---

## How it works

```mermaid
flowchart LR
    A[Person A runs Release 1: Request] --> B[Bot opens PR into release-gate]
    B --> C[Person B approves]
    C --> D{Approval checks pass?}
    D -->|No| E[Publishing stays locked]
    D -->|Yes| F[Release 3: Publish]
    F --> G{Publish succeeds?}
    G -->|Yes| H[Close PR, delete branch]
    G -->|No| I[Keep request open]
```

<br>

> [!WARNING]
> **Bring your own app; keep the gate.** This template ships a sample build and a dry-run publish step: no APK, AAB, or IPA, and nothing uploaded to a store. See the [production checklist](SETUP.md#before-you-give-it-the-store-keys) before enabling real uploads.
>
> **Avoid locking yourself out.** Add a second code owner **before** requiring code-owner approval, because PR authors cannot approve their own PRs. [Details →](SETUP.md#5-configure-code-owners-before-enforcing-reviews)

<br>

---

## Documentation

- [Setup guide](SETUP.md): adoption, permissions, using the gate, first-run checklist, and the production checklist.
- [Specification](SPEC.md): the exact gate rules and known limits.
- [Threat model](THREAT_MODEL.md): the incident behind the design and the defences it led to.

<br>

---

## License

MIT. See [LICENSE](LICENSE).
