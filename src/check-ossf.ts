import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";

type Changed = { name: string; version: string }[];

(function main() {
  const changed: Changed = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const root = process.argv[3]; // /tmp/ossf
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
