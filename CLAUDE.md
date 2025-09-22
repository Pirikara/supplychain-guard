# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Testing
- `pnpm build` - Compiles TypeScript source files in `src/` to minified CommonJS in `dist/`
- `pnpm test` - Runs all Jest tests
- `pnpm test:watch` - Runs tests in watch mode
- `pnpm test tests/specific-file.test.ts` - Runs a single test file
- `pnpm lint` - Runs Biome linter and formatter

### Development Workflow
1. Make changes to TypeScript files in `src/`
2. Run `pnpm build` to compile to `dist/`
3. Run `pnpm test` to verify functionality
4. Commit both source and built files (`dist/` is tracked in git)

## Architecture Overview

This is a GitHub Action that performs supply chain security checks on JavaScript/TypeScript projects. The action is implemented as a composite action with TypeScript utilities.

### Core Components

**GitHub Dependency Review API Integration** (`src/dependency-review.ts`)
- Primary entry point that replaces separate dependency detection and malware scanning
- Uses GitHub's native Dependency Review API to get dependency changes and vulnerability information
- Combines what were previously separate `dep-diff.ts` and `check-gh-malware.ts` modules
- Automatically detects ecosystem (npm, yarn, pnpm) and provides integrated malware detection

**Age Verification** (`src/check-age.ts`)
- Checks if newly added dependencies meet minimum release age requirements
- Helps protect against recently published malicious packages

**OSSF Malicious Packages Check** (`src/check-ossf.ts`)
- Cross-references dependency names against the OSSF malicious-packages database
- Provides an additional layer of known malware detection

**GitHub Action Workflow** (`action.yml`)
- Composite action that orchestrates all security checks
- Handles multiple package managers (npm, yarn, pnpm) with proper lockfile validation
- Includes optional GuardDog integration via pip install (not Docker) for self-hosted runner compatibility

### Key Design Decisions

**Unified Dependency Detection**: The architecture has been simplified to use GitHub's Dependency Review API instead of custom lockfile parsing. This provides better accuracy and includes vulnerability information in a single API call.

**Package Manager Agnostic**: The action automatically detects and handles npm, yarn (classic and berry), and pnpm with appropriate frozen install commands.

**Self-Hosted Runner Compatible**: GuardDog is installed via pip rather than Docker to avoid Docker-in-Docker issues on self-hosted runners.

**Composite Action Pattern**: All functionality is encapsulated in a single composite action that users can include in their workflows without complex setup.

### File Organization

- `src/` - TypeScript source files
- `dist/` - Built JavaScript files (committed to git for GitHub Actions)
- `tests/` - Jest test files
- `action.yml` - GitHub Action definition
- Build artifacts in `dist/` must be committed after changes to `src/`

### Testing Strategy

Tests use Jest with execSync to test the actual compiled JavaScript files, ensuring the built artifacts work correctly. Tests mock external API calls and file system operations to provide reliable, fast test execution.

### Security Implementation Notes

The action processes dependency changes through multiple security layers:
1. GitHub Dependency Review API for malware detection
2. Minimum age checking via npm registry API
3. OSSF malicious packages database cross-reference
4. Optional GuardDog heuristic analysis

All API calls include proper error handling and support warn-only modes for gradual rollout in CI/CD pipelines.