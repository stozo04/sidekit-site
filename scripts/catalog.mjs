const CATEGORY_NAMES = {
  video: "Video",
  audio: "Audio",
  images: "Images",
  docs: "Docs",
  textAndSpeech: "Text & Speech",
  files: "Files",
  mac: "Mac",
};

const SWIFT_STRING = String.raw`"((?:[^"\\]|\\.)*)"`;
const TOOL_ENTRY = new RegExp(
  String.raw`Tool\(\s*name:\s*${SWIFT_STRING},\s*category:\s*\.(\w+),\s*symbol:\s*${SWIFT_STRING},\s*tagline:\s*${SWIFT_STRING},\s*input:\s*(drop\(|\.\w+)`,
  "g",
);
const NAMED_ENTRY = /\bname:/g;
const SWITCH_ARM = /case\s+([^:]+):\s*(true|false)\s*$/gm;

function withoutComments(swiftSource) {
  return swiftSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function unescapeSwift(text) {
  return text.replace(/\\(.)/g, (_, escaped) => {
    if (escaped === '"' || escaped === "\\") return escaped;
    throw new Error(`Cannot read the Swift escape "\\${escaped}" in "${text}".`);
  });
}

function inputCase(input) {
  return input === "drop(" ? "dropFiles" : input.slice(1);
}

export function parseImplementedCases(toolSwiftSource) {
  const body = withoutComments(toolSwiftSource).match(/var isImplemented: Bool \{([\s\S]*?)\n {4}\}/)?.[1];
  const implemented = new Map();
  const arms = [...(body?.matchAll(SWITCH_ARM) ?? [])];
  for (const [, cases, verdict] of arms) {
    for (const name of cases.matchAll(/\.(\w+)/g)) implemented.set(name[1], verdict === "true");
  }
  const hasNestedPattern = arms.some(([, cases]) => cases.includes("("));
  if (hasNestedPattern || arms.length !== (body?.match(/\bcase\b/g)?.length ?? 0)) implemented.clear();
  if (implemented.size === 0) throw new Error("Could not read ToolInput.isImplemented: its format has changed.");
  return implemented;
}

export function parseCatalog(catalogSwiftSource, implementedCases) {
  const source = withoutComments(catalogSwiftSource);
  const tools = [...source.matchAll(TOOL_ENTRY)].map(([, name, category, , tagline, input]) => {
    const categoryName = CATEGORY_NAMES[category];
    if (!categoryName) throw new Error(`Unknown category ".${category}" for ${name}`);
    const working = implementedCases.get(inputCase(input));
    if (working === undefined)
      throw new Error(`ToolInput.isImplemented does not list ".${inputCase(input)}" (${name}).`);
    return { name: unescapeSwift(name), category: categoryName, tagline: unescapeSwift(tagline), working };
  });
  const declared = source.match(NAMED_ENTRY)?.length ?? 0;
  if (tools.length === 0 || tools.length !== declared) {
    throw new Error(`Read ${tools.length} of ${declared} tools: the catalog's format has changed.`);
  }
  return tools;
}

export function parseVersion(swiftSource) {
  const version = swiftSource.match(/static let current = "(\d+\.\d+\.\d+)"/)?.[1];
  if (!version) throw new Error("Could not find AppVersion.current.");
  return version;
}
