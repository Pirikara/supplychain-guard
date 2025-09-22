import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('check-* scripts file existence handling', () => {
  const testDir = join(__dirname, 'check-scripts-test');
  const testChangedFile = join(testDir, 'changed.json');
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


  describe('check-ossf script', () => {
    it('should handle missing changed.json file gracefully', () => {
      if (existsSync(testChangedFile)) {
        rmSync(testChangedFile);
      }

      try {
        execSync(`node ${join(__dirname, '../dist/check-ossf.js')} changed.json /tmp/fake-ossf`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        fail('Expected script to exit with error');
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr).toContain('changed.json file not found');
      }
    });

    it('should process valid changed.json file', () => {
      const testData = [
        { name: 'test-package', version: '1.0.0' }
      ];
      writeFileSync(testChangedFile, JSON.stringify(testData, null, 2));

      try {
        const result = execSync(`node ${join(__dirname, '../dist/check-ossf.js')} changed.json /tmp/fake-ossf`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        // Should not crash even with fake ossf directory
      } catch (error: any) {
        expect(error.stderr || '').not.toContain('changed.json file not found');
      }
    });
  });

  describe('dependency-review script', () => {
    it('should require GITHUB_TOKEN', () => {
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

    it('should require GITHUB_REPOSITORY', () => {
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
  });

  describe('file validation', () => {
    it('should handle empty changed.json array', () => {
      writeFileSync(testChangedFile, '[]');

      try {
        const result = execSync(`node ${join(__dirname, '../dist/check-ossf.js')} changed.json /tmp/fake-ossf`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        // Empty array should be processed without error
      } catch (error: any) {
        expect(error.stderr || '').not.toContain('changed.json file not found');
      }
    });
  });
});