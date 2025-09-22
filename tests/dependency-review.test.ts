import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('dependency-review', () => {
  const testDir = join(__dirname, 'dependency-review-test');
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
    process.env.GITHUB_TOKEN = 'fake-token';
    process.env.GITHUB_REPOSITORY = 'owner/repo';
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  describe('basic functionality', () => {
    it('should handle missing GITHUB_TOKEN', () => {
      try {
        execSync(`node ${join(__dirname, '../dist/dependency-review.js')}`, {
          encoding: 'utf8',
          stdio: 'pipe',
          env: { ...process.env, GITHUB_TOKEN: undefined }
        });
        fail('Expected script to exit with error');
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr).toContain('GITHUB_TOKEN is required');
      }
    });

    it('should handle missing GITHUB_REPOSITORY', () => {
      try {
        execSync(`node ${join(__dirname, '../dist/dependency-review.js')}`, {
          encoding: 'utf8',
          stdio: 'pipe',
          env: { ...process.env, GITHUB_TOKEN: 'fake-token', GITHUB_REPOSITORY: undefined }
        });
        fail('Expected script to exit with error');
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr).toContain('GITHUB_REPOSITORY environment variable is required');
      }
    });

    it('should handle API errors gracefully', () => {
      const eventData = {
        pull_request: {
          base: { sha: 'base-sha' },
          head: { sha: 'head-sha' }
        }
      };

      const eventPath = join(testDir, 'event.json');
      writeFileSync(eventPath, JSON.stringify(eventData));

      try {
        execSync(`node ${join(__dirname, '../dist/dependency-review.js')} changed.json malware-hits.json true`, {
          encoding: 'utf8',
          stdio: 'pipe',
          env: {
            ...process.env,
            GITHUB_TOKEN: 'invalid-token',
            GITHUB_EVENT_PATH: eventPath
          }
        });
        // Should succeed in warn-only mode even with API errors
      } catch (error: any) {
        // Expected to fail due to API error, but should show proper error message
        expect(error.stderr).toContain('Error during dependency review');
      }
    });
  });

  describe('file validation', () => {
    it('should handle missing event data gracefully', () => {
      // No GITHUB_EVENT_PATH set
      const originalEventPath = process.env.GITHUB_EVENT_PATH;
      const originalBaseRef = process.env.GITHUB_BASE_REF;
      const originalSha = process.env.GITHUB_SHA;

      delete process.env.GITHUB_EVENT_PATH;
      delete process.env.GITHUB_BASE_REF;
      delete process.env.GITHUB_SHA;

      try {
        execSync(`node ${join(__dirname, '../dist/dependency-review.js')}`, {
          encoding: 'utf8',
          stdio: 'pipe',
          env: process.env
        });
        fail('Expected script to fail without proper event data');
      } catch (error: any) {
        expect(error.stderr).toContain('Could not determine base commit SHA');
      } finally {
        // Restore environment
        if (originalEventPath) process.env.GITHUB_EVENT_PATH = originalEventPath;
        if (originalBaseRef) process.env.GITHUB_BASE_REF = originalBaseRef;
        if (originalSha) process.env.GITHUB_SHA = originalSha;
      }
    });

    it('should validate file exists', () => {
      expect(existsSync(join(__dirname, '../dist/dependency-review.js'))).toBe(true);
    });
  });
});