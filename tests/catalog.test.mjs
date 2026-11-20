import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseCatalog, parseImplementedCases, parseVersion } from "../scripts/catalog.mjs";

const TOOL_SWIFT = `
enum ToolInput: Hashable {
    var isImplemented: Bool {
        switch self {
        case .dropFiles, .live, .text:
            false
        case .link, .trimVideo,
             .mac:
            true
        }
    }
}
`;
const CASES = parseImplementedCases(TOOL_SWIFT);

const entry = (fields) => `        Tool(${fields}),\n`;
const DOWNLOAD = entry(
  'name: "Download Video", category: .video, symbol: "arrow.down.to.line",\n             tagline: "Save videos from YouTube, X, TikTok and more.", input: .link',
);
const CHANGE_SPEED = entry(
  'name: "Change Speed", category: .video, symbol: "speedometer",\n             tagline: "Speed up or slow down videos.",\n             input: drop("a Video", "Drop a video.", "film")',
);
const DAMAGED = entry(
  'name: "Fix \\"App Is Damaged\\"", category: .mac, symbol: "exclamationmark.triangle",\n             tagline: "Check who made an app.", input: .mac(.fixDamagedApp)',
);
const SUMMARIZE = entry(
  'name: "Summarize", category: .textAndSpeech, symbol: "text.alignleft", tagline: "Summarize text.", input: .text',
);
const CAPTURE = entry(
  'name: "Capture Text", category: .textAndSpeech, symbol: "viewfinder", tagline: "Copy text on screen.",\n             input: .live(symbol: "viewfinder", idle: "Ready", action: "Capture")',
);
const SAMPLE = DOWNLOAD + CHANGE_SPEED + DAMAGED + SUMMARIZE + CAPTURE;

const parse = (source) => parseCatalog(source, CASES);

test("reads name, category and tagline of every tool", () => {
  const tools = parse(SAMPLE);
  assert.equal(tools.length, 5);
  assert.deepEqual(tools.at(0), {
    name: "Download Video",
    category: "Video",
    tagline: "Save videos from YouTube, X, TikTok and more.",
    working: true,
  });
  assert.equal(tools.at(3)?.category, "Text & Speech");
});

test("a tool works only when the app's own isImplemented says so", () => {
  const working = Object.fromEntries(parse(SAMPLE).map((tool) => [tool.name, tool.working]));
  assert.deepEqual(working, {
    "Download Video": true,
    "Change Speed": false,
    'Fix "App Is Damaged"': true,
    Summarize: false,
    "Capture Text": false,
  });
  const direct = SUMMARIZE.replace("input: .text", 'input: .dropFiles(title: "Drop", hint: "h", symbol: "doc")');
  assert.equal(parse(direct).at(0)?.working, false);
});

test("an input case isImplemented does not list is an error, never a working tool", () => {
  assert.throws(() => parse(SUMMARIZE.replace("input: .text", "input: .pasteText")), /does not list "\.pasteText"/);
});

test("an entry it cannot read is an error, not a silent gap", () => {
  const reordered = CHANGE_SPEED.replace(
    'category: .video, symbol: "speedometer",',
    'symbol: "speedometer", category: .video,',
  );
  assert.throws(() => parse(DOWNLOAD + reordered), /Read 1 of 2 tools/);
  assert.throws(() => parse(DOWNLOAD + SUMMARIZE.replace("Tool(name:", ".init(name:")), /Read 1 of 2 tools/);
  assert.throws(
    () => parse(DOWNLOAD + SUMMARIZE.replace('name: "Summarize"', "name: Self.summarizeName")),
    /Read 1 of 2 tools/,
  );
  assert.throws(() => parse("enum ToolCatalog {}"), /format has changed/);
});

test("an entry wrapped onto its own lines is still read", () => {
  assert.equal(parse(DOWNLOAD.replace("Tool(name:", "Tool(\n            name:")).length, 1);
});

test("commented-out entries are not tools", () => {
  const commented = `        // ${SUMMARIZE.trim()}\n        /* ${CAPTURE.trim()} */\n`;
  assert.deepEqual(
    parse(DOWNLOAD + commented).map((tool) => tool.name),
    ["Download Video"],
  );
});

test("a Swift escape it does not understand is an error", () => {
  assert.throws(() => parse(SUMMARIZE.replace("Summarize text.", "It\\u{2019}s short.")), /Swift escape/);
  assert.throws(() => parse(SUMMARIZE.replace("Summarize text.", "\\(count) lines.")), /Swift escape/);
});

test("an unknown category is an error", () => {
  assert.throws(() => parse(DOWNLOAD.replace("category: .video", "category: .developer")), /Unknown category/);
});

test("isImplemented in an unknown shape is an error", () => {
  assert.throws(() => parseImplementedCases("enum ToolInput {}"), /isImplemented/);
  assert.throws(
    () => parseImplementedCases(TOOL_SWIFT.replace(".link, .trimVideo,", ".link, .mac(.keepAwake),")),
    /isImplemented/,
  );
  assert.throws(
    () => parseImplementedCases(TOOL_SWIFT.replace("            false", "            true && false")),
    /isImplemented/,
  );
});

test("reads the app version", () => {
  assert.equal(parseVersion('enum AppVersion {\n    static let current = "0.12.2"\n}'), "0.12.2");
  assert.throws(() => parseVersion("nothing here"), /AppVersion/);
});

test("reads the real catalog of release 0.12.2", async () => {
  const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  const tools = parseCatalog(
    await fixture("ToolCatalog-0.12.2.swift"),
    parseImplementedCases(await fixture("Tool-0.12.2.swift")),
  );
  assert.equal(tools.length, 68);
  assert.equal(tools.filter((tool) => tool.working).length, 39);
});
