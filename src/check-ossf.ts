import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Changed = { name: string; version: string; ecosystem: string }[];

// Map GitHub ecosystem names to OSSF directory names
const ECOSYSTEM_MAP: Record<string, string> = {
  npm: "npm",
  pip: "pypi",
  "rust-crate": "crates-io",
  go: "go",
  rubygems: "rubygems",
  nuget: "nuget",
  maven: "maven",
};

(function main() {
  const file = process.argv[2];
  const root = process.argv[3]; // /tmp/ossf

  if (!existsSync(file)) {
    console.error(`Error: changed.json file not found: ${file}`);
    process.exit(1);
  }

  const changed: Changed = JSON.parse(readFileSync(file, "utf8"));

  // Group dependencies by ecosystem with version info
  const ecosystemGroups: Record<
    string,
    Array<{ name: string; version: string }>
  > = {};
  for (const dep of changed) {
    const ossfDir = ECOSYSTEM_MAP[dep.ecosystem];
    if (ossfDir) {
      if (!ecosystemGroups[ossfDir]) {
        ecosystemGroups[ossfDir] = [];
      }
      ecosystemGroups[ossfDir].push({ name: dep.name, version: dep.version });
    }
  }

  let nameMatches: Array<{ ecosystem: string; packages: string[] }> = [];
  let exactMatches: Array<{
    ecosystem: string;
    packages: Array<{ name: string; version: string }>;
  }> = [];

  // Check each ecosystem
  for (const [ossfDir, packages] of Object.entries(ecosystemGroups)) {
    const ecosystemDir = join(root, "osv", "malicious", ossfDir);
    let nameHits: string[] = [];
    let exactHits: Array<{ name: string; version: string }> = [];

    try {
      if (existsSync(ecosystemDir)) {
        const packageMap = new Map(packages.map((p) => [p.name, p.version]));

        for (const d of readdirSync(ecosystemDir)) {
          const packageDir = join(ecosystemDir, d);
          if (lstatSync(packageDir).isDirectory() && packageMap.has(d)) {
            nameHits.push(d);

            // Check for exact version match by reading OSV JSON file
            const version = packageMap.get(d);
            try {
              for (const jsonFile of readdirSync(packageDir)) {
                if (jsonFile.endsWith(".json")) {
                  const jsonPath = join(packageDir, jsonFile);
                  try {
                    const osvData = JSON.parse(readFileSync(jsonPath, "utf8"));

                    // Check affected packages for version information
                    for (const affected of osvData.affected || []) {
                      if (affected.package?.name === d && affected.versions) {
                        // Check if our version is in the list of malicious versions
                        if (affected.versions.includes(version)) {
                          exactHits.push({
                            name: d,
                            version: version as string,
                          });
                          break;
                        }
                      }
                    }
                  } catch {
                    // Continue if JSON can't be parsed
                  }
                  break; // Only check first JSON file in directory
                }
              }
            } catch {
              // Continue if version directory can't be read
            }
          }
        }
      }
    } catch {
      // Silently continue if directory doesn't exist or can't be read
    }

    if (nameHits.length > 0) {
      nameMatches.push({ ecosystem: ossfDir, packages: nameHits });
    }
    if (exactHits.length > 0) {
      exactMatches.push({ ecosystem: ossfDir, packages: exactHits });
    }
  }

  // Output results grouped by type
  if (exactMatches.length > 0) {
    console.error(
      "OpenSSF malicious-packages (EXACT MATCH - NAME AND VERSION):",
    );
    for (const { ecosystem, packages } of exactMatches) {
      console.error(`  ${ecosystem}:`);
      for (const pkg of packages) {
        console.error(`    - ${pkg.name}@${pkg.version}`);
      }
    }
  }

  if (nameMatches.length > 0) {
    console.warn("OpenSSF malicious-packages (name match only):");
    for (const { ecosystem, packages } of nameMatches) {
      console.warn(`  ${ecosystem}:`);
      for (const pkg of packages) {
        console.warn(`    - ${pkg}`);
      }
    }
  }

  // Write JSON output for PR comments
  const outputFile = process.argv[4] || "ossf.json";
  const jsonOutput = {
    exactMatches: exactMatches.flatMap(({ ecosystem, packages }) =>
      packages.map((pkg) => ({
        package: `${pkg.name}@${pkg.version}`,
        name: pkg.name,
        version: pkg.version,
        ecosystem,
        type: "exact_match",
      })),
    ),
    nameMatches: nameMatches.flatMap(({ ecosystem, packages }) =>
      packages.map((pkg) => ({
        package: pkg,
        name: pkg,
        ecosystem,
        type: "name_match",
      })),
    ),
  };

  try {
    const fs = require("node:fs");
    fs.writeFileSync(
      outputFile,
      JSON.stringify(
        [...jsonOutput.exactMatches, ...jsonOutput.nameMatches],
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(`Failed to write OSSF results to ${outputFile}:`, error);
  }

  // Exit with error code if exact matches found
  if (exactMatches.length > 0) {
    process.exit(1);
  }
})();
