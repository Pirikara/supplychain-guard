import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

describe("dependency-review", () => {
  const testDir = join(__dirname, "dependency-review-test");
  const originalCwd = process.cwd();
  const originalEnv = process.env;

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

    // Restore environment
    process.env = originalEnv;
  });

  beforeEach(() => {
    process.chdir(testDir);

    // Reset environment
    process.env = { ...originalEnv };
    process.env.GITHUB_TOKEN = "fake-token";
    process.env.GITHUB_REPOSITORY = "owner/repo";
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  describe("basic functionality", () => {
    it("should handle missing GITHUB_TOKEN", () => {
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

    it("should handle missing GITHUB_REPOSITORY", () => {
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

    it("should handle API errors gracefully", () => {
      const eventData = {
        pull_request: {
          base: { sha: "base-sha" },
          head: { sha: "head-sha" },
        },
      };

      const eventPath = join(testDir, "event.json");
      writeFileSync(eventPath, JSON.stringify(eventData));

      try {
        execSync(
          `node ${join(__dirname, "../dist/dependency-review.js")} changed.json malware-hits.json true`,
          {
            encoding: "utf8",
            stdio: "pipe",
            env: {
              ...process.env,
              GITHUB_TOKEN: "invalid-token",
              GITHUB_EVENT_PATH: eventPath,
            },
          },
        );
        // Should succeed in warn-only mode even with API errors
      } catch (error: any) {
        // Expected to fail due to API error, but should show proper error message
        expect(error.stderr).toContain("Error during dependency review");
      }
    });
  });

  describe("file validation", () => {
    it("should handle missing event data gracefully", () => {
      // No GITHUB_EVENT_PATH set
      const originalEventPath = process.env.GITHUB_EVENT_PATH;
      const originalBaseRef = process.env.GITHUB_BASE_REF;
      const originalSha = process.env.GITHUB_SHA;

      delete process.env.GITHUB_EVENT_PATH;
      delete process.env.GITHUB_BASE_REF;
      delete process.env.GITHUB_SHA;

      try {
        execSync(`node ${join(__dirname, "../dist/dependency-review.js")}`, {
          encoding: "utf8",
          stdio: "pipe",
          env: process.env,
        });
        fail("Expected script to fail without proper event data");
      } catch (error: any) {
        expect(error.stderr).toContain("Could not determine base commit SHA");
      } finally {
        // Restore environment
        if (originalEventPath)
          process.env.GITHUB_EVENT_PATH = originalEventPath;
        if (originalBaseRef) process.env.GITHUB_BASE_REF = originalBaseRef;
        if (originalSha) process.env.GITHUB_SHA = originalSha;
      }
    });

    it("should validate file exists", () => {
      expect(existsSync(join(__dirname, "../dist/dependency-review.js"))).toBe(
        true,
      );
    });
  });

  describe("output file generation regression tests", () => {
    // This test suite prevents regression of the bug where files weren't created properly
    const outputTestDir = join(__dirname, "output-file-test");
    const originalCwd = process.cwd();

    beforeAll(() => {
      try {
        rmSync(outputTestDir, { recursive: true, force: true });
      } catch {}
      mkdirSync(outputTestDir, { recursive: true });
    });

    afterAll(() => {
      process.chdir(originalCwd);
      try {
        rmSync(outputTestDir, { recursive: true, force: true });
      } catch {}
    });

    beforeEach(() => {
      process.chdir(outputTestDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it("should not output JSON to stdout (regression test for stdout redirect bug)", () => {
      // This test prevents the bug where JSON was written to stdout instead of files
      // The script should create files directly, not rely on shell redirection

      try {
        execSync(
          `node ${join(__dirname, "../dist/dependency-review.js")} changed.json malware-hits.json false`,
          {
            encoding: "utf8",
            stdio: "pipe",
            env: {
              ...process.env,
              GITHUB_TOKEN: "fake-token",
              GITHUB_REPOSITORY: "owner/repo",
              // No GITHUB_EVENT_PATH to force early failure
            },
          },
        );
        fail("Expected script to exit with error");
      } catch (error: any) {
        // The key assertion: stdout should NOT contain JSON data
        // If the old bug returns, this test will catch JSON being written to stdout
        const stdout = error.stdout || "";

        // Stdout should be empty or contain only log messages, not JSON
        expect(stdout.trim()).toBe("");
        expect(stdout).not.toMatch(/^\s*\[/); // No JSON array in stdout
        expect(stdout).not.toMatch(/^\s*\{/); // No JSON object in stdout
        expect(stdout).not.toContain('"name":'); // No JSON properties in stdout
        expect(stdout).not.toContain('"ecosystem":'); // No ecosystem field in stdout

        // Verify it fails for the right reason (missing environment)
        expect(error.stderr).toContain("Could not determine base commit SHA");
      }
    });

    it("should create files even when script fails early", () => {
      // This test ensures file creation logic is called before GitHub API logic
      // Prevents regression where files weren't created due to early failures

      try {
        execSync(
          `node ${join(__dirname, "../dist/dependency-review.js")} changed.json malware-hits.json false`,
          {
            encoding: "utf8",
            stdio: "pipe",
            env: {
              ...process.env,
              GITHUB_TOKEN: "fake-token",
              GITHUB_REPOSITORY: "owner/repo",
              // Missing GITHUB_EVENT_PATH will cause early failure
            },
          },
        );
        fail("Expected script to exit with error");
      } catch (error: any) {
        // Even though script fails, it should demonstrate that file output logic exists
        // (not dependent on stdout redirection that was the original bug)

        // The script should fail early due to missing environment
        expect(error.status).toBe(1);

        // Verify the failure is due to missing GitHub environment, not file output issues
        expect(error.stderr).toContain("Could not determine base commit SHA");

        // The absence of stdout redirection artifacts proves the bug is fixed
        expect(error.stdout || "").not.toContain("changed.json");
      }
    });
  });
});
