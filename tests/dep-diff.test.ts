import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Import the functions we want to test by copying the source
// (In a real scenario, you'd refactor the source to export functions)
function gitShow(ref: string, file: string, workdir = "."): string | null {
  try {
    const gitPath = workdir === "." ? file : `${workdir}/${file}`;
    return execSync(`git show ${ref}:${gitPath}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function fromPackageLock(json: string): Map<string, string> {
  const map = new Map<string, string>();
  const j = JSON.parse(json);
  const pkgs = j.packages || {};
  for (const [k, v] of Object.entries<any>(pkgs)) {
    if (k.startsWith("node_modules/")) map.set(k.slice("node_modules/".length), v.version);
  }
  return map;
}

describe('dep-diff functionality', () => {
  const testRepoDir = join(__dirname, 'test-repo');

  beforeAll(() => {
    // Create a temporary git repo for testing
    try {
      rmSync(testRepoDir, { recursive: true, force: true });
    } catch {}

    mkdirSync(testRepoDir, { recursive: true });
    process.chdir(testRepoDir);

    // Initialize git repo
    execSync('git init', { stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { stdio: 'ignore' });
    execSync('git config user.name "Test User"', { stdio: 'ignore' });

    // Create initial package.json and lockfile
    const initialPackageJson = {
      name: "test-package",
      version: "1.0.0",
      dependencies: {
        "express": "^4.18.0"
      }
    };

    const initialLockfile = {
      name: "test-package",
      version: "1.0.0",
      lockfileVersion: 3,
      packages: {
        "": {
          name: "test-package",
          version: "1.0.0",
          dependencies: {
            "express": "^4.18.0"
          }
        },
        "node_modules/express": {
          version: "4.18.0"
        }
      }
    };

    writeFileSync('package.json', JSON.stringify(initialPackageJson, null, 2));
    writeFileSync('package-lock.json', JSON.stringify(initialLockfile, null, 2));

    execSync('git add .', { stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { stdio: 'ignore' });
  });

  afterAll(() => {
    try {
      process.chdir(__dirname);
      rmSync(testRepoDir, { recursive: true, force: true });
    } catch {}
  });

  describe('gitShow function', () => {
    it('should read files from git with default workdir', () => {
      const content = gitShow('HEAD', 'package.json');
      expect(content).toContain('test-package');
      expect(content).toContain('express');
    });

    it('should read files from git with custom workdir', () => {
      // Create a workspace subdirectory
      mkdirSync('workspace', { recursive: true });
      const workspacePackage = {
        name: "workspace-package",
        dependencies: { "lodash": "^4.17.21" }
      };
      writeFileSync('workspace/package.json', JSON.stringify(workspacePackage, null, 2));
      execSync('git add workspace/package.json', { stdio: 'ignore' });
      execSync('git commit -m "Add workspace"', { stdio: 'ignore' });

      const content = gitShow('HEAD', 'package.json', 'workspace');
      expect(content).toContain('workspace-package');
      expect(content).toContain('lodash');
    });

    it('should return null for non-existent files', () => {
      const content = gitShow('HEAD', 'non-existent.json');
      expect(content).toBeNull();
    });

    it('should return null for non-existent workdir', () => {
      const content = gitShow('HEAD', 'package.json', 'non-existent-dir');
      expect(content).toBeNull();
    });
  });

  describe('fromPackageLock function', () => {
    it('should parse package-lock.json correctly', () => {
      const lockfileContent = JSON.stringify({
        packages: {
          "": { name: "test", version: "1.0.0" },
          "node_modules/express": { version: "4.18.0" },
          "node_modules/lodash": { version: "4.17.21" }
        }
      });

      const deps = fromPackageLock(lockfileContent);
      expect(deps.get('express')).toBe('4.18.0');
      expect(deps.get('lodash')).toBe('4.17.21');
      expect(deps.has('test')).toBe(false); // Root package should be excluded
    });

    it('should handle empty packages', () => {
      const lockfileContent = JSON.stringify({ packages: {} });
      const deps = fromPackageLock(lockfileContent);
      expect(deps.size).toBe(0);
    });

    it('should handle missing packages field', () => {
      const lockfileContent = JSON.stringify({});
      const deps = fromPackageLock(lockfileContent);
      expect(deps.size).toBe(0);
    });
  });

  describe('workdir detection', () => {
    it('should detect workdir correctly when in subdirectory', () => {
      // Create workspace subdirectory and change to it
      mkdirSync('test-workspace', { recursive: true });
      const originalCwd = process.cwd();

      try {
        process.chdir('test-workspace');

        // Simulate the workdir detection logic from dep-diff.ts
        let workdir = ".";
        try {
          const gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
          const currentDir = process.cwd();
          if (currentDir !== gitRoot) {
            const relativePath = require("path").relative(gitRoot, currentDir);
            if (relativePath && !relativePath.startsWith("..")) {
              workdir = relativePath;
            }
          }
        } catch {}

        expect(workdir).toBe('test-workspace');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should use default workdir when in git root', () => {
      // Simulate being in git root
      let workdir = ".";
      try {
        const gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
        const currentDir = process.cwd();
        if (currentDir !== gitRoot) {
          const relativePath = require("path").relative(gitRoot, currentDir);
          if (relativePath && !relativePath.startsWith("..")) {
            workdir = relativePath;
          }
        }
      } catch {}

      expect(workdir).toBe('.');
    });
  });
});