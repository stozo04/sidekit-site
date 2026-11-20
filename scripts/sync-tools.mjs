import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCatalog, parseImplementedCases, parseVersion } from "./catalog.mjs";

const APP_REPO = "stozo04/Mac-Toolbox";
const CATALOG_PATH = "Sources/Toolbox/Models/ToolCatalog.swift";
const TOOL_PATH = "Sources/Toolbox/Models/Tool.swift";
const VERSION_PATH = "Sources/Toolbox/Support/ReleaseNotes.swift";
const OUTPUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/tools.json");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const fromIndex = args.indexOf("--from");
const localCheckout = fromIndex >= 0 ? args[fromIndex + 1] : undefined;
if (fromIndex >= 0 && !localCheckout) throw new Error("--from needs the path of a local checkout of the app.");

const githubToken = process.env.GITHUB_TOKEN;

async function fetchOk(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Could not fetch ${url}: HTTP ${response.status}`);
  return response;
}

async function latestReleaseTag() {
  const release = await (
    await fetchOk(
      `https://api.github.com/repos/${APP_REPO}/releases/latest`,
      githubToken ? { Authorization: `Bearer ${githubToken}` } : {},
    )
  ).json();
  return release.tag_name;
}

const releaseTag = localCheckout ? undefined : await latestReleaseTag();

async function readAppFile(relativePath) {
  if (localCheckout) return readFile(path.join(localCheckout, relativePath), "utf8");
  return (await fetchOk(`https://raw.githubusercontent.com/${APP_REPO}/${releaseTag}/${relativePath}`)).text();
}

const tools = parseCatalog(await readAppFile(CATALOG_PATH), parseImplementedCases(await readAppFile(TOOL_PATH)));
const version = parseVersion(await readAppFile(VERSION_PATH));
if (releaseTag && releaseTag !== `v${version}`) {
  throw new Error(`Release ${releaseTag} contains version ${version}: the tag and the app disagree.`);
}
const fresh = `${JSON.stringify({ version, tools }, null, 2)}\n`;

if (!checkOnly) {
  await writeFile(OUTPUT, fresh);
  console.log(`Wrote ${tools.length} tools at version ${version}.`);
} else if ((await readFile(OUTPUT, "utf8")) !== fresh) {
  console.error(
    "src/data/tools.json is behind the app's latest release. Run `npm run sync-tools` and commit the result.",
  );
  process.exit(1);
} else {
  console.log(`src/data/tools.json matches the app's latest release (${tools.length} tools, version ${version}).`);
}
