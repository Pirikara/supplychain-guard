# supplychain-guard

[![ci](https://github.com/Pirikara/supplychain-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/Pirikara/supplychain-guard/actions/workflows/ci.yml)

A GitHub Action to guard your project's supply chain across multiple programming languages and package ecosystems.

This action is designed to be used in a CI/CD pipeline, typically on pull requests. It identifies added or updated dependencies and performs comprehensive security checks across different programming languages including JavaScript/TypeScript, Python, Rust, Go, Ruby, and PHP.

## Features

- **Multi-Ecosystem Support**: Works with JavaScript/TypeScript, Python, Rust, Go, Ruby, and PHP projects automatically
- **Dependency Review**: Uses GitHub's native Dependency Review API to identify changed dependencies and vulnerabilities with pagination support for large PRs
- **Frozen Install**: Verifies lockfile integrity across multiple ecosystems with appropriate commands for each package manager
- **GitHub Advisory Integration**: Automatically scans for known malware and vulnerabilities in changed dependencies using GitHub's Advisory Database
- **OSSF Malicious Packages Check**: Cross-references dependency names against the [OSSF malicious-packages](https://github.com/ossf/malicious-packages) repository
- **GuardDog Heuristics (Optional)**: Runs [GuardDog](https://github.com/DataDog/guarddog) via pip install for heuristic analysis on npm, PyPI, Go, and GitHub Actions packages with enhanced parallelization (8 concurrent scans)
- **PR Comment Integration**: Automatically comments comprehensive security scan results summary on pull requests
- **Smart Filtering**: Filters out false positives and noise, showing only actual security issues

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
  contents: read        # for checkout
  pull-requests: write  # for PR comments (when pr-comment: true)

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
          # Optional: default is 'true'. Set to 'false' to disable OSSF check.
          enable-ossf: 'true'
          # Optional: default is 'false'. Set to 'true' to enable GuardDog scan (npm, PyPI, Go, GitHub Actions).
          enable-guarddog: 'true'
          # Optional: default is 'false'. Set to 'true' to fail job on GuardDog findings.
          guarddog-fail: 'false'
          # Optional: default is 'false'. Set to 'true' to comment scan results on PR.
          pr-comment: 'true'
          # Optional: default is 'true'. If 'false', findings will fail the job.
          warn-only: 'false'
          # Optional: default is '.'. Working directory for multi-project repositories.
          workdir: '.'
        env:
          GITHUB_TOKEN: ${{ github.token }}  # Required for PR comments and API access
```

## Inputs

| Name                 | Description                                                                              | Default                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `enable-ossf`        | If `true`, checks against the OpenSSF malicious-packages list.                           | `true`                                                                                       |
| `enable-guarddog`    | If `true`, runs GuardDog via pip install for heuristic analysis (npm, PyPI, Go, GitHub Actions). | `false`                                                                                      |
| `guarddog-fail`      | If `true`, the job will fail if GuardDog finds any issues.                               | `false`                                                                                      |
| `pr-comment`         | If `true`, comments comprehensive security scan results summary on pull requests.         | `false`                                                                                      |
| `warn-only`          | If `true`, security findings (ossf, guarddog) will only produce warnings, not fail the job. | `true`                                                                                       |
| `workdir`            | The working directory where package files are located (supports monorepos).              | `.`                                                                                          |

## Outputs

| Name                       | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| `changed-count`            | The number of added or updated dependencies across all ecosystems. |
| `malware-hits-count`       | The number of dependencies with malware advisories from GitHub. |
| `guarddog-findings-count`  | The number of findings reported by GuardDog (across all supported ecosystems). |

## PR Comment Integration

When `pr-comment: true` is enabled, the action automatically posts a comprehensive security summary as a comment on pull requests:

```markdown
## 🔒 Supply Chain Security Scan Results

### ✅ Overall Status: All Checks Passed

### 📊 Dependency Changes
- **25** dependencies added/updated
- ✅ No malware vulnerabilities detected

### 🛡️ OSSF Malicious Packages Check
- ✅ No matches found in OSSF malicious packages database

### 🐕 GuardDog Heuristic Analysis
- **25** packages scanned
- ✅ No security issues detected

### 🔒 Lockfile Integrity Check
- ✅ All lockfiles are consistent with package definitions
```

The comment provides:
- **Overall security status** at a glance
- **Detailed breakdown** of each security check
- **Issue counts and summaries** for easy review
- **Actionable information** for security teams

## Architecture

The action uses a unified approach powered by GitHub's Dependency Review API:

1. **Dependency Detection**: GitHub Dependency Review API automatically detects changes across all supported ecosystems with pagination support for large PRs
2. **Lockfile Integrity**: Multi-ecosystem frozen install validation using appropriate package manager commands
3. **Security Scanning**: Layered approach with GitHub Advisory integration, OSSF database checks, and optional GuardDog analysis with enhanced parallelization
4. **Result Aggregation**: Smart filtering and consolidation of security findings with PR comment integration
5. **Self-hosted Compatible**: Uses pip install instead of Docker for GuardDog to avoid Docker-in-Docker issues

## Example Workflows

### Monorepo with Multiple Languages
```yaml
name: Supply Chain Guard
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write  # for PR comments

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
          enable-guarddog: 'true'
          pr-comment: 'true'
          guarddog-fail: 'false'
        env:
          GITHUB_TOKEN: ${{ github.token }}

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
          enable-ossf: 'true'
          pr-comment: 'true'
        env:
          GITHUB_TOKEN: ${{ github.token }}
```

## Best Practices

### Recommended Configuration

For most projects, we recommend the following configuration:

```yaml
- name: Run Supply Chain Guard
  uses: ./.github/actions/supplychain-guard
  with:
    enable-ossf: 'true'          # Check OSSF malicious packages database
    enable-guarddog: 'true'      # Enable heuristic analysis
    guarddog-fail: 'false'       # Warning only (recommended due to false positives)
    pr-comment: 'true'           # Comment results on PR for visibility
    warn-only: 'false'           # Fail on malware/advisory findings
  env:
    GITHUB_TOKEN: ${{ github.token }}  # Required for API access and PR comments
```

### GuardDog Configuration

GuardDog includes ecosystem-specific optimizations:
- **PyPI**: Excludes `repository_integrity_mismatch` rule (high false positive rate)
- **NPM**: Skips `@types/*` packages (type definitions are typically safe)
- **Performance**: Uses 8 concurrent scans for faster analysis
- **Filtering**: Only shows packages with actual security issues

### Security Levels

Choose your security posture:

**Strict Mode** (fail on any findings):
```yaml
warn-only: 'false'
guarddog-fail: 'true'
```

**Balanced Mode** (recommended):
```yaml
warn-only: 'false'      # Fail on malware/advisories
guarddog-fail: 'false'  # Warnings for heuristics
```

**Warning Only** (monitoring mode):
```yaml
warn-only: 'true'
guarddog-fail: 'false'
```

## License

This project is licensed under the ISC License.
