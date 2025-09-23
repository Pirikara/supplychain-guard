import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("pr-comment", () => {
  const testDir = join(__dirname, "../");
  const fixturesDir = join(__dirname, "fixtures");

  beforeEach(() => {
    // Clean up any existing test files
    const files = [
      "changed.json",
      "malware-hits.json",
      "ossf.json",
      "guarddog.json",
    ];
    files.forEach((file) => {
      const path = join(testDir, file);
      if (existsSync(path)) {
        try {
          require("node:fs").unlinkSync(path);
        } catch {
          // Ignore errors
        }
      }
    });
  });

  afterEach(() => {
    // Clean up test files
    const files = [
      "changed.json",
      "malware-hits.json",
      "ossf.json",
      "guarddog.json",
    ];
    files.forEach((file) => {
      const path = join(testDir, file);
      if (existsSync(path)) {
        try {
          require("node:fs").unlinkSync(path);
        } catch {
          // Ignore errors
        }
      }
    });
  });

  it("should handle missing result files gracefully", () => {
    try {
      const result = execSync(
        `node ${join(__dirname, "../dist/pr-comment.js")} false`,
        {
          encoding: "utf8",
          stdio: "pipe",
          cwd: testDir,
          env: {
            ...process.env,
            NODE_ENV: "test",
          },
        },
      );

      expect(result).toContain("PR comment disabled, skipping");
    } catch (error: any) {
      throw new Error(`Expected success but got error: ${error.message}`);
    }
  });

  it("should generate summary when pr-comment is enabled", () => {
    // Copy fixture files
    copyFileSync(
      join(fixturesDir, "sample-ossf.json"),
      join(testDir, "changed.json"),
    );
    copyFileSync(
      join(fixturesDir, "empty-ossf.json"),
      join(testDir, "malware-hits.json"),
    );
    copyFileSync(
      join(fixturesDir, "empty-ossf.json"),
      join(testDir, "ossf.json"),
    );
    copyFileSync(
      join(fixturesDir, "empty-ossf.json"),
      join(testDir, "guarddog.json"),
    );

    try {
      const result = execSync(
        `node ${join(__dirname, "../dist/pr-comment.js")} true`,
        {
          encoding: "utf8",
          stdio: "pipe",
          cwd: testDir,
          env: {
            ...process.env,
            NODE_ENV: "test",
            // No GITHUB_REF to simulate non-PR environment
          },
        },
      );

      expect(result).toContain("Generating security scan summary");
      expect(result).toContain("Supply Chain Security Scan Results");
      expect(result).toContain("Not a pull request, skipping comment");
    } catch (error: any) {
      throw new Error(`Expected success but got error: ${error.message}`);
    }
  });

  it("should handle results with findings", () => {
    // Use a unique timestamp to avoid race conditions
    const timestamp = Date.now();
    const uniqueDir = join(__dirname, `../temp-pr-test-${timestamp}`);

    // Create unique test directory
    if (existsSync(uniqueDir)) {
      require("node:fs").rmSync(uniqueDir, { recursive: true, force: true });
    }
    require("node:fs").mkdirSync(uniqueDir, { recursive: true });

    try {
      // Copy fixture files with findings to unique directory
      copyFileSync(
        join(fixturesDir, "sample-ossf.json"),
        join(uniqueDir, "changed.json"),
      );
      copyFileSync(
        join(fixturesDir, "sample-malware-hits.json"),
        join(uniqueDir, "malware-hits.json"),
      );
      copyFileSync(
        join(fixturesDir, "sample-ossf-with-findings.json"),
        join(uniqueDir, "ossf.json"),
      );
      copyFileSync(
        join(fixturesDir, "sample-guarddog.json"),
        join(uniqueDir, "guarddog.json"),
      );

      const result = execSync(
        `node ${join(__dirname, "../dist/pr-comment.js")} true`,
        {
          encoding: "utf8",
          stdio: "pipe",
          cwd: uniqueDir,
          env: {
            ...process.env,
            NODE_ENV: "test",
          },
        },
      );

      expect(result).toContain("Issues Found");
      expect(result).toContain("malware vulnerabilities detected");
      expect(result).toContain("exact matches found in OSSF database");
      expect(result).toContain("packages with security issues detected");
    } finally {
      // Clean up unique directory
      if (existsSync(uniqueDir)) {
        require("node:fs").rmSync(uniqueDir, { recursive: true, force: true });
      }
    }
  });

  it("should validate compiled JavaScript exists", () => {
    const compiledFile = join(__dirname, "../dist/pr-comment.js");
    expect(existsSync(compiledFile)).toBe(true);
  });
});
