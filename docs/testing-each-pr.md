# Testing each pull request locally

How to check out any pull request in this repository and check it on your own machine. Nothing here needs GitHub Actions, store credentials or a second account. The live test that does need those is the "First run" section of the README.

## One-time setup

You need Node 22 or newer, and the GitHub CLI (`gh`) signed in. Two optional tools make the checks stronger:

```bash
brew install actionlint shellcheck
```

- `actionlint` reads workflow files and reports mistakes without running them.
- `shellcheck` does the same for shell scripts.

## Check out a pull request

```bash
cd rn-release-gate
gh pr checkout 7      # switches to that pull request's branch
git log --oneline -3  # confirm you are where you expect
```

`gh pr checkout <number>` downloads the branch and switches to it. To go back: `git checkout dev`.

The pull requests are a stack: each one contains the ones before it. Checking out #11 gives you everything up to and including #11.

## What to run on each one

| PR | Adds | Run | Expect |
|---|---|---|---|
| #1 | PR template, CODEOWNERS | open the files | they read correctly |
| #3 | `SPEC.md` | read it | the rules match what you want the gate to do |
| #5 | sample app, `release.config.json` | `npm ci && npm run lint && npm run typecheck && npm run build -- app-one` | `Built dist/app-one.artifact.txt` |
| | | `npm run build -- nope` | refused: unknown app, exit code 1 |
| #7 | CI and secret-scan workflows | `actionlint` | no output (clean) |
| #9 | publish workflow | `actionlint` | clean |
| #11 | trigger guard | `scripts/check-publish-trigger.sh` | "The publish gate is intact." |
| | | see "Break it on purpose" below | the guard fails |
| #13 | request workflow | `actionlint` | clean |
| #15 | approval workflow | `actionlint` | clean |
| #17 | merge notice | `actionlint` | clean |
| #19 | README | read it; open it on GitHub to see the badges | every file it names exists |

After `npm run build`, a `dist/` folder appears. It is ignored by git.

## Break it on purpose (PR #11 and later)

A check you have never seen fail is a check you cannot trust. Add a second trigger to the publish workflow and confirm the guard catches it:

```bash
# 1. Add a manual trigger next to workflow_call
sed -i '' 's/^  workflow_call:$/  workflow_call:\n  workflow_dispatch:/' .github/workflows/_publish.yml

# 2. Run the guard. It must fail and name workflow_dispatch.
scripts/check-publish-trigger.sh ; echo "exit code: $?"

# 3. Put the file back
git checkout .github/workflows/_publish.yml
scripts/check-publish-trigger.sh
```

(`sed -i ''` is the macOS form. On Linux use `sed -i` with no empty quotes.)

## What cannot be tested locally

The Request, Approve and Publish workflows only run on GitHub. `actionlint` proves they are well-formed, not that they behave. That proof is the five-step "First run" in the README, which needs the workflows merged to the default branch and two user accounts.
