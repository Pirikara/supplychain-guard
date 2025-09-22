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

This is a GitHub Action that performs supply chain security checks across multiple programming languages and package ecosystems. The action is implemented as a composite action with TypeScript utilities.

### Core Components

**Multi-Ecosystem Frozen Install Validation** (`src/frozen-install.ts`)
- Validates lockfile integrity across 6 ecosystems: Node.js, Python, Rust, Go, Ruby, PHP
- Uses interface-based architecture with ecosystem-specific handlers
- Automatically detects package managers and runs appropriate frozen install commands
- Key interface pattern:
```typescript
interface EcosystemHandler {
  name: string;
  detect(): boolean;
  validate(ignoreScripts: boolean): Promise<boolean>;
}
```

**GitHub Dependency Review API Integration** (`src/dependency-review.ts`)
- Primary entry point that uses GitHub's native Dependency Review API
- Gets dependency changes and vulnerability information with pagination support
- Outputs ecosystem information in changed.json format for downstream processing
- Replaces manual lockfile parsing with GitHub's accurate dependency detection

**OSSF Malicious Packages Check** (`src/check-ossf.ts`)
- Cross-references dependency names against the OSSF malicious-packages database
- Supports multiple ecosystems with ecosystem mapping:
```typescript
const ECOSYSTEM_MAP: Record<string, string> = {
  npm: "npm", pip: "pypi", "rust-crate": "crates-io",
  go: "go", rubygems: "rubygems", nuget: "nuget", maven: "maven"
};
```

**GuardDog Heuristic Analysis** (`src/check-guarddog.ts`)
- Multi-ecosystem GuardDog integration for npm, PyPI, Go, and GitHub Actions
- Installs GuardDog via pip (not Docker) for self-hosted runner compatibility
- Uses all available rules (no custom rule configuration to avoid ecosystem conflicts)
- Supports test environment detection with `NODE_ENV=test` to skip actual installation

### Key Design Decisions

**Multi-Ecosystem Architecture**: Expanded from Node.js-only to support 6 different programming language ecosystems with unified interfaces.

**GitHub API Integration**: Uses GitHub's Dependency Review API instead of custom lockfile parsing for better accuracy and built-in vulnerability detection.

**Ecosystem-Agnostic Rule Configuration**: GuardDog uses all available rules rather than custom ecosystem-specific rules to avoid compatibility issues.

**Test Environment Optimization**: Tests use `NODE_ENV=test` to skip actual tool installations, reducing test execution time from 90 seconds to under 1 second.

**Composite Action Pattern**: All functionality is encapsulated in a single composite action that users can include in their workflows without complex setup.

### File Organization

- `src/` - TypeScript source files
- `dist/` - Built JavaScript files (committed to git for GitHub Actions)
- `tests/` - Jest test files
- `action.yml` - GitHub Action definition
- Build artifacts in `dist/` must be committed after changes to `src/`

### Testing Strategy

Tests use Jest with execSync to test the actual compiled JavaScript files, ensuring the built artifacts work correctly. Tests focus on:
1. File processing and ecosystem detection logic
2. Parameter parsing and error handling
3. Package filtering (e.g., @types/* exclusion)
4. Command generation and output formatting

Tests do not validate external tool behavior (GuardDog, OSSF database content) as those are tested by their respective projects.

### Security Implementation Notes

The action processes dependency changes through multiple security layers:
1. GitHub Dependency Review API for malware detection and vulnerability information
2. Multi-ecosystem frozen install validation to ensure lockfile integrity
3. OSSF malicious packages database cross-reference
4. Optional GuardDog heuristic analysis for behavioral pattern detection

All components include proper error handling and support warn-only modes for gradual rollout in CI/CD pipelines.