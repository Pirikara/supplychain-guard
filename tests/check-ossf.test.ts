import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("check-ossf with OSV format", () => {
  const testDir = join(__dirname, "temp-ossf-test");
  const fixturesDir = join(__dirname, "fixtures");
  const projectRoot = join(__dirname, "..");

  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Clean up any leftover JSON files from the project root
    const filesToClean = [
      "ossf.json",
      "changed.json",
      "malware-hits.json",
      "guarddog.json",
    ];
    for (const file of filesToClean) {
      const filePath = join(projectRoot, file);
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
      }
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    // Clean up any JSON files that might have been created in the project root
    const filesToClean = [
      "ossf.json",
      "changed.json",
      "malware-hits.json",
      "guarddog.json",
    ];
    for (const file of filesToClean) {
      const filePath = join(projectRoot, file);
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true });
      }
    }
  });

  describe("basic functionality", () => {
    it("should handle missing changed.json file", () => {
      try {
        execSync(
          `node ${join(__dirname, "../dist/check-ossf.js")} nonexistent.json /tmp/fake-ossf`,
          { encoding: "utf8", stdio: "pipe" },
        );
        throw new Error("Expected script to exit with error");
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr).toContain("changed.json file not found");
      }
    });

    it("should handle empty dependency list", () => {
      const testChangedFile = join(testDir, "changed.json");
      copyFileSync(join(fixturesDir, "empty-ossf.json"), testChangedFile);

      const result = execSync(
        `node ${join(__dirname, "../dist/check-ossf.js")} "${testChangedFile}" /tmp/fake-ossf`,
        { encoding: "utf8", stdio: "pipe" },
      );

      expect(result).toBe("");
    });

    it("should handle non-existent OSSF directory", () => {
      const testChangedFile = join(testDir, "changed.json");
      copyFileSync(join(fixturesDir, "sample-ossf.json"), testChangedFile);

      const result = execSync(
        `node ${join(__dirname, "../dist/check-ossf.js")} "${testChangedFile}" /tmp/nonexistent-ossf`,
        { encoding: "utf8", stdio: "pipe" },
      );

      expect(result).toBe("");
    });
  });

  describe("JSON output", () => {
    it("should create JSON output file", () => {
      const testChangedFile = join(testDir, "changed.json");
      copyFileSync(join(fixturesDir, "sample-ossf.json"), testChangedFile);

      const outputFile = join(testDir, "ossf-output.json");

      execSync(
        `node ${join(__dirname, "../dist/check-ossf.js")} "${testChangedFile}" /tmp/fake-ossf "${outputFile}"`,
        { encoding: "utf8", stdio: "pipe" },
      );

      expect(existsSync(outputFile)).toBe(true);
      const outputData = JSON.parse(
        require("node:fs").readFileSync(outputFile, "utf8"),
      );
      expect(Array.isArray(outputData)).toBe(true);
    });
  });

  describe("integration with mock OSSF data", () => {
    it("should work with mock OSSF fixture data", () => {
      const testChangedFile = join(testDir, "changed.json");

      // Create test data that matches our mock OSSF fixture
      const testData = [
        { name: "malicious-test-package", version: "1.0.0", ecosystem: "npm" }, // Known exact match in fixture
        { name: "malicious-test-package", version: "9.9.9", ecosystem: "npm" }, // Name match only
        { name: "express", version: "4.18.2", ecosystem: "npm" }, // Safe package
      ];
      require("node:fs").writeFileSync(
        testChangedFile,
        JSON.stringify(testData, null, 2),
      );

      const mockOssfDir = join(fixturesDir, "mock-ossf");

      try {
        execSync(
          `node ${join(__dirname, "../dist/check-ossf.js")} "${testChangedFile}" "${mockOssfDir}" 2>&1`,
          { encoding: "utf8", stdio: "pipe" },
        );
      } catch (error: any) {
        const output = error.stdout || error.stderr || "";

        // Should detect exact match for version 1.0.0
        expect(output).toContain("EXACT MATCH");
        expect(output).toContain("malicious-test-package@1.0.0");

        // Should also show name match for 9.9.9
        expect(output).toContain("name match only");
        expect(output).toContain("malicious-test-package");

        // Should not mention express
        expect(output).not.toContain("express");
      }
    });
  });
});
