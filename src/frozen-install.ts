import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

interface EcosystemHandler {
  name: string;
  detect(): boolean;
  validate(): Promise<boolean>;
}

class NodeEcosystem implements EcosystemHandler {
  name = "Node.js";

  detect(): boolean {
    return existsSync("package.json");
  }

  async validate(): Promise<boolean> {
    try {
      // Check package.json for packageManager field
      let pkgManager = "";
      try {
        const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
        pkgManager = packageJson.packageManager || "";
      } catch {
        // Ignore JSON parse errors
      }

      // Detect Yarn Berry
      const isBerry = pkgManager.startsWith("yarn@") && this.isYarnBerry();

      if (isBerry) {
        console.log("Detected Yarn Berry, performing frozen install...");
        execSync("echo 'checksumBehavior: \"throw\"' >> .yarnrc.yml", {
          stdio: "inherit",
        });
        execSync(
          "YARN_ENABLE_SCRIPTS=false yarn install --immutable --inline-builds",
          { stdio: "inherit" },
        );
      } else if (existsSync("yarn.lock")) {
        console.log("Detected Yarn Classic, performing frozen install...");
        execSync("yarn install --frozen-lockfile --ignore-scripts", {
          stdio: "inherit",
        });
      } else if (
        existsSync("pnpm-lock.yaml") ||
        pkgManager.startsWith("pnpm@")
      ) {
        console.log("Detected pnpm, performing frozen install...");
        // Ensure pnpm is available
        try {
          execSync("pnpm --version", { stdio: "pipe" });
        } catch {
          execSync("corepack prepare pnpm@latest --activate", {
            stdio: "inherit",
          });
        }
        execSync("pnpm install --frozen-lockfile --ignore-scripts", {
          stdio: "inherit",
        });
      } else if (existsSync("package-lock.json")) {
        console.log("Detected npm, performing frozen install...");
        execSync("npm ci --ignore-scripts", { stdio: "inherit" });
      } else {
        console.warn(
          "No lockfile found for Node.js project, falling back to npm ci",
        );
        execSync("npm ci --ignore-scripts", { stdio: "inherit" });
      }

      return true;
    } catch (error) {
      console.error(
        `Node.js frozen install failed: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  private isYarnBerry(): boolean {
    try {
      const version = execSync("yarn --version", {
        encoding: "utf8",
        stdio: "pipe",
      });
      return !version.trim().startsWith("1.");
    } catch {
      return false;
    }
  }
}

class PythonEcosystem implements EcosystemHandler {
  name = "Python";

  detect(): boolean {
    return (
      existsSync("requirements.txt") ||
      existsSync("poetry.lock") ||
      existsSync("Pipfile.lock") ||
      existsSync("pyproject.toml")
    );
  }

  async validate(): Promise<boolean> {
    try {
      if (existsSync("poetry.lock")) {
        console.log("Detected Poetry, validating lockfile integrity...");
        execSync("poetry check --lock", { stdio: "inherit" });

        console.log(
          "Skipping Poetry install due to ignore-scripts (hardcoded for security)",
        );
      } else if (existsSync("Pipfile.lock")) {
        console.log("Detected Pipenv, validating lockfile integrity...");
        execSync("pipenv verify", { stdio: "inherit" });

        console.log(
          "Skipping Pipenv install due to ignore-scripts (hardcoded for security)",
        );
      } else if (existsSync("requirements.txt")) {
        console.log(
          "Detected pip requirements, performing dry-run validation...",
        );
        // Use --dry-run to validate without actually installing
        execSync("pip install -r requirements.txt --dry-run", {
          stdio: "inherit",
        });

        console.log(
          "Skipping pip install due to ignore-scripts (hardcoded for security)",
        );
      }

      return true;
    } catch (error) {
      console.error(
        `Python frozen install failed: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }
}

class RustEcosystem implements EcosystemHandler {
  name = "Rust";

  detect(): boolean {
    return existsSync("Cargo.toml");
  }

  async validate(): Promise<boolean> {
    try {
      if (existsSync("Cargo.lock")) {
        console.log("Detected Rust project with Cargo.lock, validating...");
        execSync("cargo check --locked", { stdio: "inherit" });
      } else {
        console.log(
          "Detected Rust project without Cargo.lock, performing check...",
        );
        execSync("cargo check", { stdio: "inherit" });
      }

      return true;
    } catch (error) {
      console.error(
        `Rust validation failed: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }
}

class GoEcosystem implements EcosystemHandler {
  name = "Go";

  detect(): boolean {
    return existsSync("go.mod");
  }

  async validate(): Promise<boolean> {
    try {
      console.log("Detected Go project, validating go.mod and go.sum...");

      // Verify module checksums
      execSync("go mod verify", { stdio: "inherit" });

      // Download dependencies to verify they exist
      execSync("go mod download", { stdio: "inherit" });

      return true;
    } catch (error) {
      console.error(
        `Go module validation failed: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }
}

class RubyEcosystem implements EcosystemHandler {
  name = "Ruby";

  detect(): boolean {
    return existsSync("Gemfile");
  }

  async validate(): Promise<boolean> {
    try {
      if (existsSync("Gemfile.lock")) {
        console.log(
          "Detected Ruby project with Gemfile.lock, performing frozen install...",
        );
        execSync("bundle install --deployment --without development test", {
          stdio: "inherit",
        });
      } else {
        console.log(
          "Detected Ruby project without Gemfile.lock, performing bundle install...",
        );
        execSync("bundle install", { stdio: "inherit" });
      }

      return true;
    } catch (error) {
      console.error(
        `Ruby bundle install failed: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }
}

class PHPEcosystem implements EcosystemHandler {
  name = "PHP";

  detect(): boolean {
    return existsSync("composer.json");
  }

  async validate(): Promise<boolean> {
    try {
      if (existsSync("composer.lock")) {
        console.log(
          "Detected PHP project with composer.lock, performing frozen install...",
        );
        execSync("composer install --no-dev --no-scripts", {
          stdio: "inherit",
        });
      } else {
        console.log(
          "Detected PHP project without composer.lock, performing composer install...",
        );
        execSync("composer install --no-scripts", { stdio: "inherit" });
      }

      return true;
    } catch (error) {
      console.error(
        `PHP composer install failed: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }
}

async function main() {
  console.log(
    `Running frozen install check in current directory: ${process.cwd()}`,
  );
  console.log(`Ignore scripts: true (hardcoded for security)`);

  const ecosystems: EcosystemHandler[] = [
    new NodeEcosystem(),
    new PythonEcosystem(),
    new RustEcosystem(),
    new GoEcosystem(),
    new RubyEcosystem(),
    new PHPEcosystem(),
  ];

  const detectedEcosystems = ecosystems.filter((ecosystem) =>
    ecosystem.detect(),
  );

  if (detectedEcosystems.length === 0) {
    console.warn("No supported package ecosystems detected in this directory");
    process.exit(1);
  }

  console.log(
    `Detected ecosystems: ${detectedEcosystems.map((e) => e.name).join(", ")}`,
  );

  let allSucceeded = true;

  for (const ecosystem of detectedEcosystems) {
    console.log(`\n=== Validating ${ecosystem.name} ===`);
    const success = await ecosystem.validate();

    if (success) {
      console.log(`✅ ${ecosystem.name} validation succeeded`);
    } else {
      console.error(`❌ ${ecosystem.name} validation failed`);
      allSucceeded = false;
    }
  }

  if (allSucceeded) {
    console.log("\n🎉 All ecosystem validations passed!");
    process.exit(0);
  } else {
    console.error("\n💥 One or more ecosystem validations failed!");
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error(
    `Unexpected error: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
});
