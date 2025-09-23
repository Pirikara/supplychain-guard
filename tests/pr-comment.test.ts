import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe("pr-comment", () => {
  const testDir = join(__dirname, "../");

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
      fail(`Expected success but got error: ${error.message}`);
    }
  });

  it("should generate summary when pr-comment is enabled", () => {
    // Create test result files
    writeFileSync(
      join(testDir, "changed.json"),
      JSON.stringify([
        { name: "test-package", version: "1.0.0", ecosystem: "npm" },
      ]),
    );
    writeFileSync(join(testDir, "malware-hits.json"), "[]");
    writeFileSync(join(testDir, "ossf.json"), "[]");
    writeFileSync(join(testDir, "guarddog.json"), "[]");

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
      fail(`Expected success but got error: ${error.message}`);
    }
  });

  it("should handle results with findings", () => {
    // Create test result files with findings
    writeFileSync(
      join(testDir, "changed.json"),
      JSON.stringify([
        { name: "test-package", version: "1.0.0", ecosystem: "npm" },
      ]),
    );
    writeFileSync(
      join(testDir, "malware-hits.json"),
      JSON.stringify([{ package: "malicious-package", vulnerability: "test" }]),
    );
    writeFileSync(
      join(testDir, "ossf.json"),
      JSON.stringify([{ package: "suspicious-package" }]),
    );
    writeFileSync(
      join(testDir, "guarddog.json"),
      JSON.stringify([
        {
          package: "problem-package",
          errors: { typosquatting: "Similar to popular package" },
          results: {},
        },
      ]),
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
          },
        },
      );

      expect(result).toContain("Issues Found");
      expect(result).toContain("malware vulnerabilities detected");
      expect(result).toContain("packages matched OSSF database");
      expect(result).toContain("packages with security issues detected");
    } catch (error: any) {
      fail(`Expected success but got error: ${error.message}`);
    }
  });

  it("should validate compiled JavaScript exists", () => {
    const compiledFile = join(__dirname, "../dist/pr-comment.js");
    expect(existsSync(compiledFile)).toBe(true);
  });
});
