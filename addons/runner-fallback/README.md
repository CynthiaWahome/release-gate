# runner-fallback

Lets one repository variable decide which runner every workflow uses, and falls back to a GitHub-hosted runner when it is not set.

[← Back to add-ons](../README.md)

## What it does

Each job uses this instead of a hard-coded runner:

```yaml
runs-on: ${{ vars.RUNNER_OS || 'ubuntu-latest' }}
```

- **`RUNNER_OS` unset:** jobs run on `ubuntu-latest`.
- **`RUNNER_OS` set:** every job runs on that runner. Point it at a self-hosted machine when hosted minutes run out or builds are too heavy, and change it back with no workflow edit.

It also includes `check-runner-fallback.sh`, which fails if a job hard-codes its runner, so the setup does not quietly erode.

## Needs

- **Variables:** `RUNNER_OS`, optional. Set it under **Settings → Secrets and variables → Actions → Variables**.
- **Secrets:** none.
- **Other add-ons:** none.

## Wire it in

1. In each workflow you want to switch, replace `runs-on: ubuntu-latest` with the expression above.
2. Optional: copy `files/scripts/check-runner-fallback.sh` to `scripts/` and keep it executable. Then add this step to `.github/workflows/ci.yml`:

   ```yaml
         - name: Check the runner fallback
           run: scripts/check-runner-fallback.sh
   ```

3. Optional: set the `RUNNER_OS` variable when you want a different runner.

### Jobs that must not follow the variable

Some jobs exist to maintain one specific machine, such as pruning a persistent runner's caches. If such a job followed `RUNNER_OS`, then with the variable set to `ubuntu-latest` it would run on a throwaway VM, clean caches that were never there, report success, and never touch the machine it exists for.

Hard-code that job's runner and mark it so the check allows it:

```yaml
    # runner-fallback: exempt (this job cleans one persistent machine)
    runs-on: my-persistent-runner
```

The comment can sit on the same line or on the line directly above.

## Safe by default

With the variable unset, nothing changes except the runner label, and it is the same hosted runner you would have written by hand. The check script only reads workflow files.

A job that uses a list of labels, a matrix, or any other `runs-on` value fails the check unless it is marked exempt. That is deliberate: it makes you decide.

## How it was tested

The guard script against sample workflows, with the real script:

```bash
addons/runner-fallback/tests/run.sh
```

The tests check that a workflow using the fallback passes, that a hard-coded runner or a label list fails and names the file and line, that an exemption works on the same line or the line above, that a comment further away does not count, and that a missing folder or empty folder is an error. I also broke the check on purpose and confirmed the tests fail.

**Not tested:** how GitHub evaluates the expression. This repository has no runner variable set, and the tests do not run GitHub Actions. Confirm once by running a workflow with the variable unset and again with it set to a runner you have.

## Why it exists

Hosted runners are free until the minutes run out, and a heavy native build is a poor fit for one. Being able to move every workflow to a self-hosted machine, and back, by changing one variable saves editing every file under pressure.
