# supplychain-guard

[![ci](https://github.com/Pirikara/supplychain-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/Pirikara/supplychain-guard/actions/workflows/ci.yml)

A GitHub Action to guard your project's supply chain across multiple programming languages and package ecosystems.

This action is designed to be used in a CI/CD pipeline, typically on pull requests. It identifies added or updated dependencies and performs comprehensive security checks across different programming languages including JavaScript/TypeScript, Python, Rust, Go, Ruby, and PHP.

## Features

- **Multi-Ecosystem Support**: Works with JavaScript/TypeScript, Python, Rust, Go, Ruby, and PHP projects automatically
- **Dependency Review**: Uses GitHub's native Dependency Review API to identify changed dependencies and vulnerabilities with pagination support for large PRs
- **Frozen Install**: Verifies lockfile integrity across multiple ecosystems with appropriate commands for each package manager
- **Minimum Release Age**: Checks if new/updated packages have been published for a minimum number of days, helping to avoid recently published malicious packages
- **GitHub Advisory Integration**: Automatically scans for known malware and vulnerabilities in changed dependencies using GitHub's Advisory Database
- **OSSF Malicious Packages Check**: Cross-references dependency names against the [OSSF malicious-packages](https://github.com/ossf/malicious-packages) repository
- **GuardDog Heuristics (Optional)**: Runs [GuardDog](https://github.com/DataDog/guarddog) via pip install for heuristic analysis on npm packages

## Supported Ecosystems

| Language | Package Managers | Lockfiles | Commands |
|----------|------------------|-----------|----------|
| **Node.js** | npm, yarn, pnpm | `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` | `npm ci`, `yarn --frozen-lockfile`, `pnpm install --frozen-lockfile` |
| **Python** | pip, Poetry, Pipenv | `requirements.txt`, `poetry.lock`, `Pipfile.lock` | `poetry check --lock`, `pipenv verify`, `pip install --dry-run` |
| **Rust** | Cargo | `Cargo.lock` | `cargo check --locked` |
| **Go** | go modules | `go.mod`, `go.sum` | `go mod verify`, `go mod download` |
| **Ruby** | Bundler | `Gemfile.lock` | `bundle install --deployment` |
| **PHP** | Composer | `composer.lock` | `composer install --no-dev` |

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
          # Optional: default is 'false'. Set to 'true' to enable GuardDog scan (npm only).
          enable-guarddog: 'true'
          # Optional: default is 'true'. If 'false', findings will fail the job.
          warn-only: 'false'
          # Optional: default is '.'. Working directory for multi-project repositories.
          workdir: '.'
```

## Inputs

| Name                 | Description                                                                              | Default                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `node-version`       | Node version for the job (e.g., 'lts/*', '22').                                         | `lts/*`                                                                                      |
| `ignore-scripts`     | Disable lifecycle scripts during install across all supported ecosystems.                | `true`                                                                                       |
| `minimum-age-days`   | Minimum release age (in days) for newly added/updated dependencies.                      | `7`                                                                                          |
| `enable-ossf`        | If `true`, checks against the OpenSSF malicious-packages list.                           | `true`                                                                                       |
| `enable-guarddog`    | If `true`, runs GuardDog via pip install for heuristic analysis (npm packages only).     | `false`                                                                                      |
| `guarddog-rules`     | Space-separated list of GuardDog rules to apply.                                         | `typosquatting npm-install-script npm-obfuscation npm-silent-process-execution direct_url_dependency` |
| `guarddog-fail`      | If `true`, the job will fail if GuardDog finds any issues.                               | `false`                                                                                      |
| `warn-only`          | If `true`, security findings (age, ossf, guarddog) will only produce warnings, not fail the job. | `true`                                                                                       |
| `workdir`            | The working directory where package files are located (supports monorepos).              | `.`                                                                                          |

## Outputs

| Name                       | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| `changed-count`            | The number of added or updated dependencies across all ecosystems. |
| `age-violations-count`     | The number of dependencies violating the minimum age requirement. |
| `malware-hits-count`       | The number of dependencies with malware advisories from GitHub. |
| `guarddog-findings-count`  | The number of findings reported by GuardDog (npm only). |

## Architecture

The action uses a unified approach powered by GitHub's Dependency Review API:

1. **Dependency Detection**: GitHub Dependency Review API automatically detects changes across all supported ecosystems with pagination support for large PRs
2. **Lockfile Integrity**: Multi-ecosystem frozen install validation using appropriate package manager commands
3. **Security Scanning**: Layered approach with GitHub Advisory integration, OSSF database checks, and optional GuardDog analysis
4. **Self-hosted Compatible**: Uses pip install instead of Docker for GuardDog to avoid Docker-in-Docker issues

## Example Workflows

### Monorepo with Multiple Languages
```yaml
name: Supply Chain Guard
on:
  pull_request:

permissions:
  contents: read

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Guardian
        uses: actions/checkout@v4
        with:
          repository: your-org/supplychain-guard
          path: ./.github/actions/supplychain-guard

      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Guard Frontend Dependencies
        uses: ./.github/actions/supplychain-guard
        with:
          workdir: './frontend'
          ignore-scripts: 'true'
          enable-guarddog: 'true'

  backend:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Guardian
        uses: actions/checkout@v4
        with:
          repository: your-org/supplychain-guard
          path: ./.github/actions/supplychain-guard

      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Guard Backend Dependencies
        uses: ./.github/actions/supplychain-guard
        with:
          workdir: './backend'
          minimum-age-days: 14
```

## License

This project is licensed under the ISC License.
