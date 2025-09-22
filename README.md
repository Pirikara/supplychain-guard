# supplychain-guard

[![ci](https://github.com/Pirikara/supplychain-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/Pirikara/supplychain-guard/actions/workflows/ci.yml)

A GitHub Action to guard your JavaScript/TypeScript project's supply chain.

This action is designed to be used in a CI/CD pipeline, typically on pull requests. It identifies added or updated dependencies and performs several security checks on them.

## Features

- **Dependency Diff**: Identifies changed dependencies by comparing lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) between the PR's base and head.
- **Frozen Install**: Verifies lockfile integrity by running a frozen install (`npm ci`, `pnpm install --frozen-lockfile`, etc.).
- **Minimum Release Age**: Checks if new/updated packages have been published for a minimum number of days, helping to avoid recently published malicious packages.
- **GitHub Malware Scan**: Scans for known malware in changed dependencies using the GitHub Advisory Database.
- **OSSF Name Check**: Checks changed dependency names against the [OSSF malicious-packages](https://github.com/ossf/malicious-packages) repository.
- **GuardDog Heuristics (Optional)**: Runs [GuardDog](https://github.com/DataDog/guarddog) to perform heuristic analysis on package metadata and install scripts.

## Usage

Create a workflow file (e.g., `.github/workflows/supply-chain-guard.yml`) in your repository.

```yaml
name: Supply Chain Guard
on:
  pull_request:

permissions:
  contents: read # for checkout

jobs:
  guard:
    runs-on: ubuntu-latest
    steps:
      # This action is a composite action, so you must check out the repository that contains the action.
      - name: Checkout Guardian
        uses: actions/checkout@v4
        with:
          repository: tomoyayamashita/supplychain-guard
          path: ./.github/actions/supplychain-guard

      # Then, check out your own repository
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Run Supply Chain Guard
        uses: ./.github/actions/supplychain-guard
        with:
          # Optional: default is 'true'. Set to 'false' to allow lifecycle scripts.
          ignore-scripts: 'true'
          # Optional: default is 7. Minimum age in days for a new package version.
          minimum-age-days: 7
          # Optional: default is 'true'. Set to 'false' to disable OSSF check.
          enable-ossf: 'true'
          # Optional: default is 'false'. Set to 'true' to enable GuardDog scan.
          enable-guarddog: 'true'
          # Optional: default is 'true'. If 'false', findings will fail the job.
          warn-only: 'false'
```

## Inputs

| Name                 | Description                                                                              | Default                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `node-version`       | Node version for the job (e.g., 'lts/*', '22').                                         | `lts/*`                                                                                      |
| `ignore-scripts`     | Disable lifecycle scripts during install (`--ignore-scripts`).                            | `true`                                                                                       |
| `minimum-age-days`   | Minimum release age (in days) for newly added/updated dependencies.                      | `7`                                                                                          |
| `enable-ossf`        | If `true`, checks against the OpenSSF malicious-packages list.                           | `true`                                                                                       |
| `enable-guarddog`    | If `true`, runs GuardDog npm scan via Docker for heuristic analysis.                     | `false`                                                                                      |
| `guarddog-rules`     | Space-separated list of GuardDog rules to apply.                                         | `typosquatting npm-install-script npm-obfuscation npm-silent-process-execution direct_url_dependency` |
| `guarddog-fail`      | If `true`, the job will fail if GuardDog finds any issues.                               | `false`                                                                                      |
| `warn-only`          | If `true`, security findings (age, ossf, guarddog) will only produce warnings, not fail the job. | `true`                                                                                       |
| `workdir`            | The working directory where `package.json` and the lockfile are located.                 | `.`                                                                                          |

## Outputs

| Name                       | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| `changed-count`            | The number of added or updated dependencies.          |
| `age-violations-count`     | The number of dependencies violating the minimum age. |
| `malware-hits-count`       | The number of dependencies with malware advisories.   |
| `guarddog-findings-count`  | The number of findings reported by GuardDog.          |

## License

This project is licensed under the ISC License.
