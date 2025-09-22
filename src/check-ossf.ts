import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";

type Changed = { name: string; version: string }[];

(function main() {
  const file = process.argv[2];
  const root = process.argv[3]; // /tmp/ossf

  if (!existsSync(file)) {
    console.error(`Error: changed.json file not found: ${file}`);
    process.exit(1);
  }

  const changed: Changed = JSON.parse(readFileSync(file, "utf8"));
  const npmDir = join(root, "npm");
  let hits: string[] = [];
  try {
    const names = new Set(changed.map(x => x.name));
    for (const d of readdirSync(npmDir)) {
      const p = join(npmDir, d);
      if (lstatSync(p).isDirectory() && names.has(d)) hits.push(d);
    }
  } catch {}
  if (hits.length) console.warn("OpenSSF malicious-packages (name match):\n" + hits.map(n => `- ${n}`).join("\n"));
})();
