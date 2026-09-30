import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// The API routes spawn scripts/*.mjs as separate Node processes, so Next's
// file tracing cannot see what those scripts import. List the packages the
// scripts use and include each one together with its own dependencies.
const scriptPackages = ["@google/genai", "@vercel/blob", "dotenv", "jsonrepair", "papaparse"];

function findPackageDir(name: string, from: string) {
  let dir = from;

  while (true) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function collectPackageDirs(names: string[]) {
  const root = process.cwd();
  const seen = new Set<string>();

  function walk(name: string, from: string) {
    const dir = findPackageDir(name, from);
    if (!dir || seen.has(dir)) return;
    seen.add(dir);

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };

    for (const dep of Object.keys(deps)) walk(dep, dir);
  }

  names.forEach((name) => walk(name, root));

  return [...seen].map((dir) => `./${path.relative(root, dir).split(path.sep).join("/")}/**/*`);
}

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/*": [
      "./scripts/**/*",
      "./data/saas-conference-source-pages.json",
      "./data/open-lead-rss-sources.json",
      ...collectPackageDirs(scriptPackages),
    ],
  },
};

export default nextConfig;
