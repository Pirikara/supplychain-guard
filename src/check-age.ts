import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

type Changed = { name: string; version: string }[];

function npmPublishTime(name: string, version: string): Date | null {
  try {
    const out = execSync(`npm view ${name}@${version} time --json`, { encoding: "utf8" });
    const obj = JSON.parse(out);
    const iso = obj?.[version];
    return iso ? new Date(iso) : null;
  } catch {
    return null;
  }
}

(function main() {
  const file = process.argv[2];
  const minDays = parseInt(process.argv[3] || "7", 10);
  const warnOnly = String(process.argv[4] || "true") === "true";
  const changed: Changed = JSON.parse(readFileSync(file, "utf8"));

  const bad: { name: string; version: string; publishedAt: string; ageDays: number }[] = [];
  for (const { name, version } of changed) {
    const t = npmPublishTime(name, version);
    if (!t) continue;
    const ageDays = (Date.now() - t.getTime()) / 86400000;
    if (ageDays < minDays) bad.push({ name, version, publishedAt: t.toISOString(), ageDays: +ageDays.toFixed(2) });
  }

  if (bad.length) {
    const msg =
      `minimumReleaseAge < ${minDays}d:\n` + bad.map(b => `- ${b.name}@${b.version} (${b.ageDays}d, ${b.publishedAt})`).join("\n");
    if (warnOnly) console.warn(msg);
    else {
      console.error(msg);
      process.exit(1);
    }
  }
})();
