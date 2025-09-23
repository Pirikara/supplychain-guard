import { readFileSync, writeFileSync } from "node:fs";

type DependencyChange = {
  name: string;
  version: string;
  ecosystem: string;
  changeType: "added" | "removed" | "updated";
  vulnerabilities: VulnerabilityInfo[];
};

type VulnerabilityInfo = {
  severity: string;
  advisory: {
    ghsa_id: string;
    cve_id?: string;
    summary: string;
    description: string;
    severity: string;
    published_at: string;
  };
};

type DependencyReviewResponse = {
  name: string;
  version: string;
  ecosystem: string;
  change_type: "added" | "removed" | "updated";
  manifest: string;
  vulnerabilities: VulnerabilityInfo[];
};

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

async function fetchJSON(path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      "User-Agent": "supplychain-guard",
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  return res.json();
}

function getRefsFromEnvironment(): {
  base: string;
  head: string;
  owner: string;
  repo: string;
} {
  // Get repository info from environment
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    throw new Error("GITHUB_REPOSITORY environment variable is required");
  }
  const [owner, repo] = repository.split("/");

  // Get refs from GitHub event payload
  let base = "";
  let head = "HEAD";

  try {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (eventPath) {
      const event = JSON.parse(readFileSync(eventPath, "utf8"));
      base = event?.pull_request?.base?.sha || "";
      head = event?.pull_request?.head?.sha || "HEAD";
    }
  } catch {
    // Fallback to environment variables
    base = process.env.GITHUB_BASE_REF || "";
    head = process.env.GITHUB_SHA || "HEAD";
  }

  if (!base) {
    throw new Error("Could not determine base commit SHA");
  }

  return { base, head, owner, repo };
}

async function getDependencyChanges(): Promise<DependencyChange[]> {
  const { base, head, owner, repo } = getRefsFromEnvironment();

  console.log(`Fetching dependency changes between ${base} and ${head}...`);

  try {
    // GitHub API may have pagination limits, so we'll handle potential pagination
    let allChanges: DependencyReviewResponse[] = [];
    let page = 1;
    const perPage = 100; // Standard GitHub API page size

    while (true) {
      console.log(`Fetching dependency changes page ${page}...`);

      const url = `/repos/${owner}/${repo}/dependency-graph/compare/${base}...${head}?per_page=${perPage}&page=${page}`;
      const response: DependencyReviewResponse[] = await fetchJSON(url);

      if (!Array.isArray(response)) {
        // If response is not an array, it might be the full response on first page
        allChanges = Array.isArray(response) ? response : [];
        break;
      }

      allChanges.push(...response);
      console.log(`Page ${page}: ${response.length} changes`);

      // If we got fewer results than requested, we've reached the end
      if (response.length < perPage) {
        break;
      }

      page++;

      // Safety limit to prevent infinite loops
      if (page > 50) {
        console.warn("Reached maximum page limit (50), stopping pagination");
        break;
      }
    }

    console.log(
      `Found total ${allChanges.length} dependency changes across ${page} pages`,
    );

    const changes: DependencyChange[] = allChanges
      .filter(
        (dep) => dep.change_type === "added" || dep.change_type === "updated",
      )
      .map((dep) => ({
        name: dep.name,
        version: dep.version,
        ecosystem: dep.ecosystem,
        changeType: dep.change_type,
        vulnerabilities: dep.vulnerabilities || [],
      }));

    return changes;
  } catch (error) {
    console.error(
      `Error fetching dependency changes: ${error instanceof Error ? error.message : error}`,
    );
    throw error;
  }
}

async function checkMalwareVulnerabilities(
  changes: DependencyChange[],
): Promise<
  { name: string; version: string; vulnerabilities: VulnerabilityInfo[] }[]
> {
  const malwareHits: {
    name: string;
    version: string;
    vulnerabilities: VulnerabilityInfo[];
  }[] = [];

  for (const change of changes) {
    const malwareVulns = change.vulnerabilities.filter(
      (vuln) =>
        vuln.advisory.summary.toLowerCase().includes("malware") ||
        vuln.advisory.description.toLowerCase().includes("malware") ||
        vuln.advisory.ghsa_id.includes("malware"), // Check if GitHub labels it as malware
    );

    if (malwareVulns.length > 0) {
      malwareHits.push({
        name: change.name,
        version: change.version,
        vulnerabilities: malwareVulns,
      });
    }
  }

  return malwareHits;
}

(async function main() {
  const _outputFile = process.argv[2] || "changed.json";
  const _malwareOutputFile = process.argv[3] || "malware-hits.json";
  const warnOnly = String(process.argv[4] || "false") === "true";

  try {
    const changes = await getDependencyChanges();

    // Output changed dependencies in the format expected by other tools
    const changedDeps = changes.map((change) => ({
      name: change.name,
      version: change.version,
      ecosystem: change.ecosystem,
    }));

    // Write changed dependencies to file
    writeFileSync("changed.json", JSON.stringify(changedDeps, null, 2));

    // Check for malware vulnerabilities
    const malwareHits = await checkMalwareVulnerabilities(changes);

    // Write malware hits to file
    writeFileSync("malware-hits.json", JSON.stringify(malwareHits, null, 2));

    if (malwareHits.length > 0) {
      const msg = `Malware vulnerabilities detected:\n${malwareHits
        .map(
          (hit) =>
            `- ${hit.name}@${hit.version}: ${hit.vulnerabilities.map((v) => v.advisory.summary).join(", ")}`,
        )
        .join("\n")}`;

      if (warnOnly) {
        console.warn(msg);
      } else {
        console.error(msg);
        process.exit(1);
      }
    } else {
      console.log(
        "No malware vulnerabilities detected in changed dependencies",
      );
    }

    // Output detailed vulnerability information
    console.error(`\nSummary: ${changes.length} dependencies changed`);
    console.error(`Malware hits: ${malwareHits.length}`);

    const totalVulns = changes.reduce(
      (sum, change) => sum + change.vulnerabilities.length,
      0,
    );
    if (totalVulns > 0) {
      console.error(`Total vulnerabilities: ${totalVulns}`);
    }
  } catch (error) {
    console.error(
      `Error during dependency review: ${error instanceof Error ? error.message : error}`,
    );
    if (warnOnly) {
      console.warn(
        "Dependency review failed, but continuing due to warn-only mode",
      );
    } else {
      process.exit(1);
    }
  }
})();
