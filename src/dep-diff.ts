import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

type Dep = { name: string; version: string };

function gitShow(ref: string, file: string, workdir = "."): string | null {
  try {
    const gitPath = workdir === "." ? file : `${workdir}/${file}`;
    return execSync(`git show ${ref}:${gitPath}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function getRefs(): { base: string; head: string } {
  // PR payload から取る（無ければフォールバック）
  let base = "";
  let head = "HEAD";
  try {
    const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, "utf8"));
    base = ev?.pull_request?.base?.sha || "";
    head = ev?.pull_request?.head?.sha || "HEAD";
  } catch {}
  if (!base) {
    try {
      base = execSync("git merge-base HEAD origin/HEAD", { encoding: "utf8" }).trim();
    } catch {
      base = "HEAD~1";
    }
  }
  return { base, head };
}

// --- 各ロック/manifestから name@version を抽出（簡易実装） ---
function fromPackageLock(json: string): Map<string, string> {
  const map = new Map<string, string>();
  const j = JSON.parse(json);
  const pkgs = j.packages || {};
  for (const [k, v] of Object.entries<any>(pkgs)) {
    if (k.startsWith("node_modules/")) {
      // Extract actual package name from nested paths
      // "node_modules/cliui/node_modules/ansi-regex" -> "ansi-regex"
      // "node_modules/@scope/package" -> "@scope/package"
      const pathParts = k.split("/");
      let packageName = "";

      // Find the last "node_modules" and get the package name after it
      for (let i = pathParts.length - 1; i >= 0; i--) {
        if (pathParts[i] === "node_modules" && i + 1 < pathParts.length) {
          // Handle scoped packages (@scope/package)
          if (pathParts[i + 1].startsWith("@") && i + 2 < pathParts.length) {
            packageName = `${pathParts[i + 1]}/${pathParts[i + 2]}`;
          } else {
            packageName = pathParts[i + 1];
          }
          break;
        }
      }

      if (packageName) {
        map.set(packageName, v.version);
      }
    }
  }
  return map;
}

// ざっくり抽出（厳密ではないが dependabot/直依存更新用途なら十分）
function fromYarnLock(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  let current: string | null = null;
  for (const line of lines) {
    // Match yarn.lock package key lines like: "package@version", "@scope/package@version":
    if (/^["\s]*(.+@.+)["\s]*:/.test(line)) {
      const match = line.match(/^["\s]*(.+@.+?)["\s]*:/);
      if (match) {
        const keys = match[1].split(/",\s*"/); // Handle multiple keys
        // Take the first key and extract package name
        const firstKey = keys[0].replace(/^"/, '');
        const at = firstKey.lastIndexOf("@");
        if (at > 0) {
          let name = firstKey.slice(0, at);
          // Handle scoped packages properly
          if (name.startsWith("@")) {
            // For @scope/package@version, find the second @ if exists
            const parts = firstKey.split("@");
            if (parts.length >= 3) {
              name = `@${parts[1]}`;
            }
          }
          current = name;
        }
      }
    } else if (current && line.trim().startsWith('version "')) {
      const m = line.trim().match(/^version "([^"]+)"/);
      if (m) map.set(current, m[1]);
      current = null;
    }
  }
  return map;
}

function fromPnpmLock(text: string): Map<string, string> {
  const map = new Map<string, string>();
  // Match patterns like:
  // '  @babel/core@7.28.4:' (modern pnpm)
  // '  /@babel/core/7.28.4:' (older pnpm)
  for (const line of text.split(/\r?\n/)) {
    // Modern format: '  packagename@version:'
    let match = line.match(/^  ([^@\s]+(?:@[^@\s]+)?(?:\/[^@\s]+)?)@([^:]+):/);
    if (match) {
      map.set(match[1], match[2]);
      continue;
    }

    // Legacy format: '  /packagename/version:'
    match = line.match(/^  \/(@?[^/]+(?:\/[^/]+)?)\/([^:]+):/);
    if (match) {
      map.set(match[1], match[2]);
      continue;
    }
  }
  return map;
}

function fromPackageJson(json: string): Map<string, string> {
  const map = new Map<string, string>();
  const j = JSON.parse(json);
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const o = j[field] || {};
    for (const [n, v] of Object.entries<string>(o)) map.set(n, v);
  }
  return map;
}

function depsForRef(ref: string, workdir = "."): Map<string, string> {
  // 優先順：package-lock → yarn.lock → pnpm-lock → package.json
  const pl = gitShow(ref, "package-lock.json", workdir);
  if (pl) return fromPackageLock(pl);
  const yl = gitShow(ref, "yarn.lock", workdir);
  if (yl) return fromYarnLock(yl);
  const pn = gitShow(ref, "pnpm-lock.yaml", workdir);
  if (pn) return fromPnpmLock(pn);
  const pj = gitShow(ref, "package.json", workdir);
  if (pj) return fromPackageJson(pj);
  return new Map();
}

(function main() {
  const { base, head } = getRefs();

  // Detect workdir from current working directory relative to git root
  let workdir = ".";
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
    const currentDir = process.cwd();
    if (currentDir !== gitRoot) {
      const relativePath = require("path").relative(gitRoot, currentDir);
      if (relativePath && !relativePath.startsWith("..")) {
        workdir = relativePath;
      }
    }
  } catch {}

  const baseMap = depsForRef(base, workdir);
  const headMap = depsForRef(head, workdir);
  const changed: Dep[] = [];
  for (const [name, ver] of headMap.entries()) {
    const b = baseMap.get(name);
    if (!b || b !== ver) changed.push({ name, version: ver });
  }
  process.stdout.write(JSON.stringify(changed, null, 2));
})();
