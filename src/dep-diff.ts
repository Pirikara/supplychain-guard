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
    if (k.startsWith("node_modules/")) map.set(k.slice("node_modules/".length), v.version);
  }
  return map;
}

// ざっくり抽出（厳密ではないが dependabot/直依存更新用途なら十分）
function fromYarnLock(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = text.split(/\r?\n/);
  let current: string | null = null;
  for (const line of lines) {
    if (/^".+@|^[^"\s].+@/.test(line)) {
      const key = line.replace(/:$/, "").trim().replace(/^"+|"+$/g, "");
      // "@scope/name@^x" または "name@^x"
      const at = key.lastIndexOf("@");
      const name = key.startsWith("@") ? key.slice(0, at) : key.slice(0, at);
      current = name;
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
  const re = /^ {2}\/(@?[^/]+)\/([^:]+):/; // "  /name/1.2.3:" の行
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (m) map.set(m[1], m[2]);
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
