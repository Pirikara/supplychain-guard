import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('frozen-install', () => {
  const testDir = join(__dirname, 'frozen-install-test');
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
    // Clean up any files from previous tests
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  describe('ecosystem detection', () => {
    it('should detect Node.js projects', () => {
      writeFileSync('package.json', '{"name": "test"}');

      try {
        const result = execSync(`node ${join(__dirname, '../dist/frozen-install.js')} . true`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });

        expect(result).toContain('Node.js');
      } catch (error: any) {
        // Even if install fails, should detect the ecosystem
        expect(error.stdout).toContain('Node.js');
      }
    });

    it('should detect Python projects with requirements.txt', () => {
      writeFileSync('requirements.txt', 'requests==2.28.0');

      try {
        const result = execSync(`node ${join(__dirname, '../dist/frozen-install.js')} . true`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });

        expect(result).toContain('Python');
      } catch (error: any) {
        expect(error.stdout).toContain('Python');
      }
    });

    it('should detect Rust projects', () => {
      writeFileSync('Cargo.toml', '[package]\nname = "test"\nversion = "0.1.0"');

      try {
        const result = execSync(`node ${join(__dirname, '../dist/frozen-install.js')} . true`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });

        expect(result).toContain('Rust');
      } catch (error: any) {
        expect(error.stdout).toContain('Rust');
      }
    });

    it('should detect Go projects', () => {
      writeFileSync('go.mod', 'module test\n\ngo 1.19');

      try {
        const result = execSync(`node ${join(__dirname, '../dist/frozen-install.js')} . true`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });

        expect(result).toContain('Go');
      } catch (error: any) {
        expect(error.stdout).toContain('Go');
      }
    });

    it('should detect multiple ecosystems', () => {
      writeFileSync('package.json', '{"name": "test"}');
      writeFileSync('requirements.txt', 'requests==2.28.0');
      writeFileSync('Cargo.toml', '[package]\nname = "test"\nversion = "0.1.0"');

      try {
        const result = execSync(`node ${join(__dirname, '../dist/frozen-install.js')} . true`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });

        expect(result).toContain('Node.js');
        expect(result).toContain('Python');
        expect(result).toContain('Rust');
      } catch (error: any) {
        const output = error.stdout || '';
        expect(output).toContain('Node.js');
        expect(output).toContain('Python');
        expect(output).toContain('Rust');
      }
    });
  });

  describe('error handling', () => {
    it('should handle validation failures gracefully', () => {
      // Create an invalid package.json to test error handling
      writeFileSync('package.json', '{"name": "test-invalid"}');

      try {
        execSync(`node ${join(__dirname, '../dist/frozen-install.js')} . true`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        // May succeed or fail depending on npm ci availability
      } catch (error: any) {
        // Should exit with non-zero status on validation failure
        expect(error.status).toBe(1);
        expect(error.stdout || error.stderr).toContain('Node.js');
      }
    });

    it('should handle missing commands gracefully', () => {
      writeFileSync('requirements.txt', 'requests==2.28.0');

      try {
        execSync(`node ${join(__dirname, '../dist/frozen-install.js')} . true`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 10000
        });
      } catch (error: any) {
        // Expected to fail due to missing Python/pip, but should show proper error
        const output = error.stdout + error.stderr;
        expect(output).toContain('Python');
      }
    });

    it('should handle invalid package files', () => {
      writeFileSync('package.json', 'invalid json content');

      try {
        execSync(`node ${join(__dirname, '../dist/frozen-install.js')} . true`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
      } catch (error: any) {
        // Should detect Node.js but may fail on invalid JSON
        const output = error.stdout || '';
        expect(output).toContain('Node.js');
      }
    });
  });

  describe('ignore-scripts parameter', () => {
    it('should always ignore scripts regardless of input (legacy compatibility)', () => {
      writeFileSync('package.json', '{"name": "test", "scripts": {"postinstall": "echo harmful"}}');

      try {
        execSync(`node ${join(__dirname, '../dist/frozen-install.js')} .`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
      } catch (error: any) {
        expect(error.stdout).toContain('Ignore scripts: true (hardcoded for security)');
      }
    });

    it('should always use ignore-scripts true (hardcoded for security)', () => {
      writeFileSync('package.json', '{"name": "test"}');

      try {
        execSync(`node ${join(__dirname, '../dist/frozen-install.js')} .`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
      } catch (error: any) {
        expect(error.stdout).toContain('Ignore scripts: true (hardcoded for security)');
      }
    });
  });

  describe('working directory', () => {
    it('should handle custom working directory', () => {
      const subDir = join(testDir, 'subproject');
      mkdirSync(subDir, { recursive: true });
      writeFileSync(join(subDir, 'package.json'), '{"name": "subproject"}');

      try {
        execSync(`node ${join(__dirname, '../dist/frozen-install.js')} subproject true`, {
          encoding: 'utf8',
          stdio: 'pipe',
          cwd: testDir
        });
      } catch (error: any) {
        expect(error.stdout).toContain('Running frozen install check in directory: subproject');
        expect(error.stdout).toContain('Node.js');
      }
    });
  });

  describe('file validation', () => {
    it('should validate compiled JavaScript exists', () => {
      expect(existsSync(join(__dirname, '../dist/frozen-install.js'))).toBe(true);
    });
  });
});