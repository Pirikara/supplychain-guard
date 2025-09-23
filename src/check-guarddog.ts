import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

type Changed = { name: string; version: string; ecosystem: string }[];

type GuardDogResult = {
  package: string;
  issues: number;
  errors: Record<string, string>;
  results: Record<string, any>;
  path: string;
  ecosystem?: string;
};

// Map GitHub ecosystem names to GuardDog ecosystem names
const ECOSYSTEM_MAP: Record<string, string> = {
  npm: "npm",
  pip: "pypi",
  go: "go",
  actions: "github-action",
};

function shouldSkipPackage(name: string, ecosystem: string): boolean {
  // Skip @types/* packages for npm (they're typically safe type definitions)
  if (ecosystem === "npm" && name.startsWith("@types/")) {
    return true;
  }
  return false;
}

function getExcludeRulesFlags(ecosystem: string): string {
  const excludeRules: string[] = [];

  // PyPI-specific rules with high false positive rates
  if (ecosystem === "pypi") {
    excludeRules.push("repository_integrity_mismatch");
  }

  // Add more ecosystem-specific exclusions as needed
  // if (ecosystem === "npm") {
  //   excludeRules.push("some_npm_specific_rule");
  // }

  return excludeRules.map((rule) => `--exclude-rules ${rule}`).join(" ");
}

async function scanPackage(
  ecosystem: string,
  name: string,
  version: string,
): Promise<GuardDogResult | null> {
  try {
    console.log(`  Scanning ${ecosystem}:${name}@${version}...`);

    const excludeFlags = getExcludeRulesFlags(ecosystem);
    const command = `python3 -m guarddog "${ecosystem}" scan "${name}" --version "${version}" ${excludeFlags} --output-format json`;
    const output = execSync(command, {
      encoding: "utf8",
      stdio: "pipe",
    });

    if (!output.trim()) {
      return null;
    }

    const result: GuardDogResult = JSON.parse(output);
    result.ecosystem = ecosystem;
    return result;
  } catch (_error) {
    // GuardDog scan failures are common (package not found, etc.)
    // We silently continue rather than failing the entire process
    return null;
  }
}

async function installGuardDog(): Promise<boolean> {
  try {
    console.log("Installing GuardDog...");

    // Skip installation in test environment
    if (process.env.NODE_ENV === "test") {
      console.log("Test environment detected, skipping GuardDog installation");
      return false;
    }

    execSync("python3 -m pip install --quiet guarddog", { stdio: "inherit" });
    return true;
  } catch (_error) {
    console.warn("Failed to install GuardDog via pip, skipping scan");
    return false;
  }
}

async function main() {
  const changedFile = process.argv[2] || "changed.json";
  const guardDogFail = (process.argv[3] || "false") === "true";

  if (!existsSync(changedFile)) {
    console.error(`Error: ${changedFile} file not found`);
    process.exit(1);
  }

  const changed: Changed = JSON.parse(readFileSync(changedFile, "utf8"));

  if (changed.length === 0) {
    console.log("No changed packages -> skip guarddog");
    writeFileSync("guarddog.json", "[]");
    return;
  }

  // Install GuardDog
  if (!(await installGuardDog())) {
    writeFileSync("guarddog.json", "[]");
    return;
  }

  // Rules exclusion is now handled per-ecosystem in scanPackage function

  // Group packages by ecosystem
  const ecosystemGroups: Record<
    string,
    Array<{ name: string; version: string }>
  > = {};
  const skippedEcosystems = new Set<string>();

  for (const dep of changed) {
    const guardDogEcosystem = ECOSYSTEM_MAP[dep.ecosystem];
    if (!guardDogEcosystem) {
      skippedEcosystems.add(dep.ecosystem);
      continue; // Skip unsupported ecosystems
    }

    if (shouldSkipPackage(dep.name, dep.ecosystem)) {
      continue; // Skip packages that don't need scanning
    }

    if (!ecosystemGroups[guardDogEcosystem]) {
      ecosystemGroups[guardDogEcosystem] = [];
    }

    ecosystemGroups[guardDogEcosystem].push({
      name: dep.name,
      version: dep.version,
    });
  }

  // Scan all packages with improved parallelization
  const allResults: GuardDogResult[] = [];
  const maxConcurrency = 8; // Increased from 3 for better performance

  // Flatten all packages across ecosystems for global parallelization
  const allScanTasks: Array<{
    ecosystem: string;
    name: string;
    version: string;
  }> = [];

  for (const [ecosystem, packages] of Object.entries(ecosystemGroups)) {
    for (const pkg of packages) {
      allScanTasks.push({
        ecosystem,
        name: pkg.name,
        version: pkg.version,
      });
    }
  }

  // Report skipped ecosystems
  if (skippedEcosystems.size > 0) {
    console.log(
      `Skipping unsupported ecosystems: ${Array.from(skippedEcosystems).join(", ")}`,
    );
  }

  if (allScanTasks.length === 0) {
    console.log("No packages to scan with GuardDog");
    writeFileSync("guarddog.json", "[]");
    return;
  }

  console.log(
    `Scanning ${allScanTasks.length} packages across all ecosystems (concurrency: ${maxConcurrency})...`,
  );

  // Process all packages in batches for optimal performance
  const batchSize = maxConcurrency;

  for (let i = 0; i < allScanTasks.length; i += batchSize) {
    const batch = allScanTasks.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(allScanTasks.length / batchSize);

    console.log(
      `Processing batch ${batchNum}/${totalBatches} (${batch.length} packages)...`,
    );

    const batchPromises = batch.map((task) =>
      scanPackage(task.ecosystem, task.name, task.version),
    );

    const batchResults = await Promise.all(batchPromises);
    allResults.push(...batchResults.filter((r) => r !== null));
  }

  // Write results
  writeFileSync("guarddog.json", JSON.stringify(allResults, null, 2));

  // Report findings
  if (allResults.length > 0) {
    console.log(`GuardDog findings: ${allResults.length}`);

    // Show findings by ecosystem
    const ecosystemCounts: Record<string, number> = {};
    for (const result of allResults) {
      if (result.ecosystem) {
        ecosystemCounts[result.ecosystem] =
          (ecosystemCounts[result.ecosystem] || 0) + 1;
      }
    }

    for (const [ecosystem, count] of Object.entries(ecosystemCounts)) {
      console.log(`  ${ecosystem}: ${count} findings`);
    }

    // Show detailed findings (only packages with actual issues)
    const packagesWithIssues = allResults.filter((result) => {
      // Check if there are actual errors
      if (result.errors && Object.keys(result.errors).length > 0) {
        return true;
      }

      // Check if there are significant results (not null/empty)
      if (result.results && Object.keys(result.results).length > 0) {
        const significantResults = Object.entries(result.results).filter(
          ([_key, value]) => {
            if (value === null || value === undefined) return false;
            if (typeof value === "object" && Object.keys(value).length === 0)
              return false;
            if (Array.isArray(value) && value.length === 0) return false;
            return true;
          },
        );
        return significantResults.length > 0;
      }

      return false;
    });

    if (packagesWithIssues.length > 0) {
      console.log(
        `\nDetailed findings (${packagesWithIssues.length} packages with actual issues):`,
      );

      for (const result of packagesWithIssues) {
        console.log(`\nPackage: ${result.package}`);
        if (result.ecosystem) {
          console.log(`  Ecosystem: ${result.ecosystem}`);
        }

        // Show errors/findings
        if (result.errors && Object.keys(result.errors).length > 0) {
          console.log("  Issues found:");
          for (const [rule, description] of Object.entries(result.errors)) {
            console.log(`    - ${rule}: ${description}`);
          }
        }

        // Show significant results only
        if (result.results && Object.keys(result.results).length > 0) {
          const significantResults = Object.entries(result.results).filter(
            ([_key, value]) => {
              if (value === null || value === undefined) return false;
              if (typeof value === "object" && Object.keys(value).length === 0)
                return false;
              if (Array.isArray(value) && value.length === 0) return false;
              return true;
            },
          );

          if (significantResults.length > 0) {
            console.log("  Additional findings:");
            for (const [key, value] of significantResults) {
              console.log(`    - ${key}: ${JSON.stringify(value)}`);
            }
          }
        }
      }
    } else {
      console.log("\nNo packages with actual security issues found.");
    }

    if (guardDogFail) {
      console.error(
        `GuardDog reported ${allResults.length} findings across all ecosystems`,
      );
      process.exit(1);
    }
  } else {
    console.log("GuardDog produced no findings.");
  }
}

// Run main function
main().catch((error) => {
  console.error(
    `GuardDog scan failed: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
});
