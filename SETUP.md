# Set up Release Gate

[← Back to the overview](README.md)

Use this guide to adopt the gate, configure access, and test a release request before connecting real store credentials.

## Choose how to adopt it

### Starting a new repository

Select **Use this template → Create a new repository** on GitHub. Start with just the default branch; the request workflow creates `release-gate` when needed.

For local sample checks, use Node.js 22 and npm, matching the publish workflow.

### Adding the gate to an existing app

Bring across:

- [release-request.yml](.github/workflows/release-request.yml), [release-approve.yml](.github/workflows/release-approve.yml), and [_publish.yml](.github/workflows/_publish.yml).
- The [merge-notice workflow](.github/workflows/release-gate-notice.yml).
- [release.config.json](release.config.json).
- [scripts/check-publish-trigger.sh](scripts/check-publish-trigger.sh), plus its check from [ci.yml](.github/workflows/ci.yml).
- The relevant [CODEOWNERS](.github/CODEOWNERS) entries.

Integrate these into your existing CI. Keep your app, package scripts, lockfile, and build tooling; the sample files here are not replacements for them.

## Configure the gate

### 1. Point publishing at your repository

In [release-approve.yml](.github/workflows/release-approve.yml), replace the existing `uses:` value with your owner, repository, and default branch:

```yaml
uses: YOUR-OWNER/YOUR-REPO/.github/workflows/_publish.yml@YOUR-DEFAULT-BRANCH
```

The current reference is `wamziliary/rn-release-gate/.github/workflows/_publish.yml@dev`. Replace all three parts when adopting the template, and update the value after a rename or transfer.

The explicit reference is intentional: it selects the publish workflow definition from that branch instead of resolving a relative reference against the release-request PR.

### 2. Set your release approvers

In the same file, configure actual GitHub user logins, separated by spaces:

```yaml
ALLOWED_APPROVERS: "CynthiaWahome wamzii"
```

Replace these with your reviewers. An organisation name is not a reviewer. Approvers need permission to submit approving reviews on the request PR.

> **Two accounts are not necessarily two people.** The gate compares GitHub logins. Independent approval still needs a different human—not just your other browser profile.

### 3. Configure apps and tracks

Update both:

- The allowed values in [release.config.json](release.config.json).
- The matching manual-run `options` in [release-request.yml](.github/workflows/release-request.yml).

The dropdowns make valid requests convenient. The config checks reject invalid values.

### 4. Allow Actions to open request PRs

Go to **Settings → Actions → General → Workflow permissions** and enable **Allow GitHub Actions to create and approve pull requests**.

If that setting is unavailable, check the organisation or enterprise Actions policy. The workflow requests the token permissions it needs, but repository settings cannot override a more restrictive organisation policy.

### 5. Configure code owners before enforcing reviews

Edit [.github/CODEOWNERS](.github/CODEOWNERS) to name the people responsible for workflow changes:

```text
/.github/workflows/ @CynthiaWahome @wamzii
/.github/CODEOWNERS @CynthiaWahome @wamzii
```

Use your owners, keep them on the same line for each pattern, and ensure each has write access.

**Do not skip this bit:** `CODEOWNERS` does not block edits by itself. Requiring code-owner approval through branch protection or rulesets is what enforces it.

If you are the only eligible code owner and author a workflow-change PR, you cannot approve your own PR. That can block merging unless an applicable bypass or settings change is available. Owning the repository is not the same as having a guaranteed bypass.

Before enabling enforcement:

1. Add another eligible owner and confirm their access.
2. Land the ownership configuration on the default branch.
3. Enable required code-owner reviews.
4. Understand your recovery options before applying rules to administrators or removing bypass access.

GitHub uses the ownership file already on the PR's base branch. Adding a reviewer inside an already-blocked PR is not an escape hatch. With both owners listed, either eligible owner's approval can satisfy the code-owner requirement; listing two does not require both approvals. See [GitHub's CODEOWNERS rules](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

#### Meet the two lists

| Configuration | What it controls |
|---|---|
| `.github/CODEOWNERS` | Who reviews changes to the workflows and ownership file |
| `ALLOWED_APPROVERS` | Whose approval can authorise a release |

They can contain the same people, but neither configures the other.

### 6. Try the dry run before adding credentials

Leave the sample build and publishing step in place for your first run. Follow the first-run checklist below.

Then replace:

- The **Build** step in [_publish.yml](.github/workflows/_publish.yml) with your real build command.
- The **Publish (dry run)** step with your store upload.

For a new repository, replace the sample app files with your application. For an existing repository, use the tooling you already have. Keep store and signing credential references confined to the publish workflow, backed by suitable environment protections.

Before enabling real uploads, complete the production checklist below.

## Using the gate

### 1. Request a release

Open **Actions → Release 1: Request → Run workflow**, select the intended branch, app, and track, then run it. The bot opens a PR into `release-gate`; ask an authorised reviewer to review it.

### 2. Approve a release

A different authorised person opens the request PR and submits **Review changes → Approve**. The gate checks the request before calling the publish workflow.

> **Do not merge the request PR.**  
> `release-gate` is an isolated holding branch for release requests—not somewhere you merge application changes. This is an approval queue, not a merge queue wearing a different hat.

- **Success:** The workflow closes the request and deletes its branch.
- **Failure:** The request stays open. Inspect the logs and, for real uploads, the store state before rerunning—a failed job does not guarantee nothing was uploaded.
- **Changed your mind?** Close an unapproved request without merging it.

## Workflow reference

| Workflow | File | What starts it |
|---|---|---|
| Release 1: Request | [release-request.yml](.github/workflows/release-request.yml) | A manual run |
| Release 2: Approve and publish | [release-approve.yml](.github/workflows/release-approve.yml) | A submitted PR review |
| Release 3: Publish | [_publish.yml](.github/workflows/_publish.yml) | A call from the approval workflow |
| Merge notice | [release-gate-notice.yml](.github/workflows/release-gate-notice.yml) | A merged request |
| CI | [ci.yml](.github/workflows/ci.yml) | Configured pushes and PRs |
| Secret scan | [security.yml](.github/workflows/security.yml) | Configured pushes, PRs, and scheduled runs |

## First-run checklist

Use two accounts with permission to submit approving reviews. Put the requester on `ALLOWED_APPROVERS` too, so the self-approval test reaches the intended check.

- [ ] Account A requests a release; the bot opens a PR into `release-gate`.
- [ ] Account A approves the bot-authored PR; the gate rejects self-approval.
- [ ] Account B approves; the sample build and dry-run publish complete.
- [ ] The summary identifies the app, track, requester, and approver.
- [ ] The successful request closes and its branch is deleted.
- [ ] A separate test request is merged; merging triggers the notice, not publishing.
- [ ] On a disposable branch, adding `workflow_dispatch` to `_publish.yml` makes the publish-trigger guard fail. Discard that test change afterward.

See [Using the gate](#using-the-gate) for the everyday request and approval steps.

## Before you give it the store keys

The workflow gate is one layer—not a force field around repository write access.

| Check | Why it matters |
|---|---|
| Protect store and signing credentials with a GitHub Environment and suitable access rules | Someone with write access may be able to add another workflow. Plain repository secrets are not isolated to this publishing path |
| Restrict pushes to `release-request/**` and `release-gate` | Protect request contents and the workflow code used by review-triggered runs; allow the automation the access it needs |
| Protect the default branch and require code-owner review | The approver list and approval logic live in files that can be changed |
| Define the exact source revision to build | The request records a commit, but the sample publish workflow does **not** explicitly check out that recorded commit |
| Make uploads safe to retry | An upload can succeed externally even when a later step fails |
| Pin third-party actions to full commit SHAs | Version tags are movable references |

Check your GitHub plan and test environment branch restrictions with review-triggered runs before relying on them.

## Renaming or transferring a repository using the gate

After a move, update:

- Badge URLs and their linked Actions pages, plus the static visibility badge if visibility changes.
- The reusable workflow's `uses:` reference.
- Repository references in setup instructions.
- Your local Git remote.

Recheck collaborator access, code-owner eligibility, Actions settings, environments, and branch protections.

**Private-repository owners:** transferring to a personal Free account can remove access to protected-branch features. Check the destination plan before assuming the same safeguards remain available. See [GitHub's transfer documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository).

## Local checks

```bash
npm ci
npm run lint
npm run typecheck
bash scripts/check-publish-trigger.sh
actionlint
```

What these actually do:

- `lint` syntax-checks the sample build script.
- `typecheck` is currently a placeholder—not a real type check.
- The trigger guard should print `The publish gate is intact.`
- `actionlint` checks the workflows and must be installed separately.

To exercise the sample build:

```bash
npm run build -- app-one
```

Replace the sample checks with your application's real lint, type-check, and test commands when integrating it.
