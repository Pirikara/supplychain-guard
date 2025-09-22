import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe("check-* scripts file existence handling", () => {
  const testDir = join(__dirname, "check-scripts-test");
  const testChangedFile = join(testDir, "changed.json");
  const originalCwd = process.cwd();

  beforeAll(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  describe("check-ossf script", () => {
    it("should handle missing changed.json file gracefully", () => {
      if (existsSync(testChangedFile)) {
        rmSync(testChangedFile);
      }

      try {
        execSync(
          `node ${join(__dirname, "../dist/check-ossf.js")} changed.json /tmp/fake-ossf`,
          {
            encoding: "utf8",
            stdio: "pipe",
          },
        );
        fail("Expected script to exit with error");
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr).toContain("changed.json file not found");
      }
    });

    it("should process valid changed.json file with ecosystem field", () => {
      const testData = [
        { name: "test-package", version: "1.0.0", ecosystem: "npm" },
      ];
      writeFileSync(testChangedFile, JSON.stringify(testData, null, 2));

      // Should complete successfully even with non-existent OSSF directory
      const result = execSync(
        `node ${join(__dirname, "../dist/check-ossf.js")} changed.json /tmp/fake-ossf 2>&1`,
        {
          encoding: "utf8",
          stdio: "pipe",
        },
      );

      // Should not output any warnings (no malicious packages found)
      expect(result).toBe("");
    });

    it("should handle multi-ecosystem packages", () => {
      const testData = [
        { name: "express", version: "4.18.2", ecosystem: "npm" },
        { name: "requests", version: "2.28.0", ecosystem: "pip" },
        { name: "unknown-package", version: "1.0.0", ecosystem: "unsupported" },
      ];
      writeFileSync(testChangedFile, JSON.stringify(testData, null, 2));

      // Should process all ecosystems, ignoring unsupported ones
      const result = execSync(
        `node ${join(__dirname, "../dist/check-ossf.js")} changed.json /tmp/fake-ossf 2>&1`,
        {
          encoding: "utf8",
          stdio: "pipe",
        },
      );

      // Should not output any warnings (no malicious packages found in fake directory)
      expect(result).toBe("");
    });

    it("should handle unknown ecosystems gracefully", () => {
      const testData = [
        {
          name: "test-package",
          version: "1.0.0",
          ecosystem: "unknown-ecosystem",
        },
      ];
      writeFileSync(testChangedFile, JSON.stringify(testData, null, 2));

      // Should silently skip unknown ecosystems without error
      const result = execSync(
        `node ${join(__dirname, "../dist/check-ossf.js")} changed.json /tmp/fake-ossf 2>&1`,
        {
          encoding: "utf8",
          stdio: "pipe",
        },
      );

      // Should not output any warnings (unknown ecosystem ignored)
      expect(result).toBe("");
    });
  });

  describe("check-guarddog script", () => {
    it("should handle missing changed.json file gracefully", () => {
      if (existsSync(testChangedFile)) {
        rmSync(testChangedFile);
      }

      try {
        execSync(
          `node ${join(__dirname, "../dist/check-guarddog.js")} changed.json "" false`,
          {
            encoding: "utf8",
            stdio: "pipe",
          },
        );
        fail("Expected script to exit with error");
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr).toContain("changed.json file not found");
      }
    });

    it("should process valid changed.json file with ecosystem field", () => {
      const testData = [
        { name: "test-package", version: "1.0.0", ecosystem: "npm" },
      ];
      writeFileSync(testChangedFile, JSON.stringify(testData, null, 2));

      // Should complete successfully and create guarddog.json
      const result = execSync(
        `node ${join(__dirname, "../dist/check-guarddog.js")} changed.json "" false 2>&1`,
        {
          encoding: "utf8",
          stdio: "pipe",
          timeout: 30000,
        },
      );

      expect(result).toContain("Installing GuardDog");
      expect(existsSync(join(testDir, "guarddog.json"))).toBe(true);
    });

    it("should handle empty package list", () => {
      writeFileSync(testChangedFile, "[]");

      const result = execSync(
        `node ${join(__dirname, "../dist/check-guarddog.js")} changed.json "" false 2>&1`,
        {
          encoding: "utf8",
          stdio: "pipe",
        },
      );

      expect(result).toContain("No changed packages -> skip guarddog");
    });
  });

  describe("dependency-review script", () => {
    it("should require GITHUB_TOKEN", () => {
      try {
        execSync(`node ${join(__dirname, "../dist/dependency-review.js")}`, {
          encoding: "utf8",
          stdio: "pipe",
          env: { ...process.env, GITHUB_TOKEN: undefined },
        });
        fail("Expected script to exit with error");
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr).toContain("GITHUB_TOKEN is required");
      }
    });

    it("should require GITHUB_REPOSITORY", () => {
      try {
        execSync(`node ${join(__dirname, "../dist/dependency-review.js")}`, {
          encoding: "utf8",
          stdio: "pipe",
          env: {
            ...process.env,
            GITHUB_TOKEN: "fake-token",
            GITHUB_REPOSITORY: undefined,
          },
        });
        fail("Expected script to exit with error");
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr).toContain(
          "GITHUB_REPOSITORY environment variable is required",
        );
      }
    });
  });

  describe("file validation", () => {
    it("should handle empty changed.json array", () => {
      writeFileSync(testChangedFile, "[]");

      try {
        const _result = execSync(
          `node ${join(__dirname, "../dist/check-ossf.js")} changed.json /tmp/fake-ossf`,
          {
            encoding: "utf8",
            stdio: "pipe",
          },
        );
        // Empty array should be processed without error
      } catch (error: any) {
        expect(error.stderr || "").not.toContain("changed.json file not found");
      }
    });
  });

  describe("check-ossf integration", () => {
    it("should detect malicious packages with real OSSF repo if available", () => {
      // Only run if OSSF repo is available
      if (!existsSync("/tmp/ossf-repo")) {
        return; // Skip test if OSSF repo not available
      }

      const testData = [
        { name: "--hiljson", version: "1.0.0", ecosystem: "npm" }, // Known malicious npm package
        { name: "0-8", version: "1.0.0", ecosystem: "pip" }, // Known malicious pypi package
        { name: "express", version: "4.18.2", ecosystem: "npm" }, // Legitimate package
      ];
      writeFileSync(testChangedFile, JSON.stringify(testData, null, 2));

      // OSSF check should complete successfully (exit 0) even when warnings are found
      const result = execSync(
        `node ${join(__dirname, "../dist/check-ossf.js")} changed.json /tmp/ossf-repo 2>&1`,
        {
          encoding: "utf8",
          stdio: "pipe",
        },
      );

      // Should detect malicious packages and output them with ecosystem grouping
      expect(result).toContain("--hiljson");
      expect(result).toContain("0-8");
      expect(result).not.toContain("express"); // Legitimate package should not be flagged
      expect(result).toContain("npm:");
      expect(result).toContain("pypi:");
      expect(result).toContain("OpenSSF malicious-packages");
    });
  });
});
