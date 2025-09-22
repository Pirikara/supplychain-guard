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

  // Group dependencies by ecosystem
  const ecosystemGroups: Record<string, string[]> = {};
  for (const dep of changed) {
    const ossfDir = ECOSYSTEM_MAP[dep.ecosystem];
    if (ossfDir) {
      if (!ecosystemGroups[ossfDir]) {
        ecosystemGroups[ossfDir] = [];
      }
      ecosystemGroups[ossfDir].push(dep.name);
    }
  }

  let totalHits: Array<{ ecosystem: string; packages: string[] }> = [];

  // Check each ecosystem
  for (const [ossfDir, packageNames] of Object.entries(ecosystemGroups)) {
    const ecosystemDir = join(root, "osv", "malicious", ossfDir);
    let hits: string[] = [];

    try {
      if (existsSync(ecosystemDir)) {
        const names = new Set(packageNames);
        for (const d of readdirSync(ecosystemDir)) {
          const p = join(ecosystemDir, d);
          if (lstatSync(p).isDirectory() && names.has(d)) {
            hits.push(d);
          }
        }
      }
    } catch {
      // Silently continue if directory doesn't exist or can't be read
    }

    if (hits.length > 0) {
      totalHits.push({ ecosystem: ossfDir, packages: hits });
    }
  }

  // Output results grouped by ecosystem
  if (totalHits.length > 0) {
    console.warn("OpenSSF malicious-packages (name match):");
    for (const { ecosystem, packages } of totalHits) {
      console.warn(`  ${ecosystem}:`);
      for (const pkg of packages) {
        console.warn(`    - ${pkg}`);
      }
    }
  }
})();
