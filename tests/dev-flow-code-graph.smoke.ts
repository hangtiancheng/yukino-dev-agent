import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runCodeGraph } from "@/lib/dev-flow/codegraph-client";
import {
  GraphImpactSchema,
  GraphIndexSchema,
  GraphSearchSchema,
} from "@/lib/dev-flow/codegraph-types";

const root = await mkdtemp(path.join(os.tmpdir(), "devflow-codegraph-"));
const outside = await mkdtemp(path.join(os.tmpdir(), "devflow-outside-"));
const search = (query = "", extra: Record<string, unknown> = {}) =>
  runCodeGraph(root, { action: "search", query, ...extra }, GraphSearchSchema);
const index = (mode = "rebuild") =>
  runCodeGraph(root, { action: "index", mode }, GraphIndexSchema);
const impact = (files: string[], depth = 2) =>
  runCodeGraph(root, { action: "impact", files, depth }, GraphImpactSchema);

try {
  assert.equal(
    (await search()).status.initialized,
    false,
    "an unindexed checkout stays unindexed on read",
  );
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "src/a.ts"),
    "export function same() { return 1; }\n",
  );
  await writeFile(
    path.join(root, "src/b.ts"),
    "export function same() { return 2; }\n",
  );
  await writeFile(
    path.join(root, "src/caller.ts"),
    'import { same } from "./a";\nexport function invoke() { return same(); }\n',
  );
  await writeFile(
    path.join(root, "src/entry.ts"),
    'import { invoke } from "./caller";\nexport function entry() { return invoke(); }\n',
  );
  await writeFile(
    path.join(root, "src/method.ts"),
    "export class Worker {\n  async perform(\n    value: number,\n  ) {\n    return value;\n  }\n}\n",
  );
  await writeFile(
    path.join(root, "sample.py"),
    "class Service:\n    def execute(self):\n        return 42\n",
  );
  await writeFile(path.join(root, ".gitignore"), "ignored/\n");
  await mkdir(path.join(root, "ignored"));
  await writeFile(
    path.join(root, "ignored/secret.ts"),
    "export function ignoredSymbol() {}\n",
  );
  await writeFile(
    path.join(outside, "secret.ts"),
    "export function outsideSecret() {}\n",
  );
  await symlink(path.join(outside, "secret.ts"), path.join(root, "linked.ts"));

  await assert.rejects(
    index(),
    /escapes the checkout/,
    "external symlinks are rejected before native indexing",
  );
  await unlink(path.join(root, "linked.ts"));
  await writeFile(
    path.join(root, "greeting.ts"),
    "export function greeting() { return '中文内容'; }\n",
  );
  await symlink(
    path.join(outside, "secret.ts"),
    path.join(root, "ignored/unsafe.ts"),
  );
  await assert.rejects(
    index(),
    /escapes the checkout/,
    "ignored paths cannot hide external symlinks from a CodeGraph include override",
  );
  await unlink(path.join(root, "ignored/unsafe.ts"));
  const built = await index();
  assert.equal(built.status.engine, "codegraph");
  assert.equal(built.status.state, "complete");
  assert.equal(built.status.stale, false);
  assert.equal(built.filesErrored, 0);
  assert.ok(built.status.nodeCount > 10);
  assert.ok(
    (await readFile(path.join(root, ".codegraph/codegraph.db")))
      .subarray(0, 16)
      .toString()
      .startsWith("SQLite format 3"),
  );

  assert.ok(
    (await search("greeting")).excerpts.some((item) =>
      item.content.includes("中文内容"),
    ),
    "UTF-8 excerpts survive the child-process wire protocol",
  );

  const methods = await search("perform", {
    kind: "method",
    language: "typescript",
  });
  assert.equal(
    methods.nodes.length,
    1,
    "tree-sitter detects multiline class methods",
  );
  assert.equal(methods.nodes[0]?.startLine, 2);
  assert.equal(
    methods.nodes[0]?.endLine,
    6,
    "AST spans end at the method body",
  );
  assert.ok(methods.excerpts[0]?.content.includes("return value"));
  assert.ok((await search("execute", { language: "python" })).nodes.length > 0);
  assert.equal((await search("ignoredSymbol")).nodes.length, 0);
  assert.equal(
    (await search("outsideSecret")).nodes.length,
    0,
    "external symlinks are excluded",
  );

  const aImpact = await impact(["./src/a.ts", "src/a.ts"]);
  assert.deepEqual(aImpact.files, ["src/a.ts"]);
  const calls = aImpact.dependents.filter((edge) => edge.kind === "calls");
  assert.ok(
    calls.some(
      (edge) =>
        edge.source.name === "invoke" &&
        edge.target.filePath === "src/a.ts" &&
        edge.depth === 1,
    ),
  );
  assert.ok(
    calls.some((edge) => edge.source.name === "entry" && edge.depth === 2),
    "transitive callers are included",
  );
  const bImpact = await impact(["src/b.ts"]);
  assert.ok(
    !bImpact.dependents.some((edge) => edge.source.name === "invoke"),
    "same-named declarations must not share callers",
  );
  const oneHop = await impact(["src/a.ts"], 1);
  assert.ok(!oneHop.dependents.some((edge) => edge.source.name === "entry"));
  assert.equal(
    (await search("", { path: "src/b.ts" })).nodes.every(
      (node) => node.filePath === "src/b.ts",
    ),
    true,
  );
  assert.equal((await search("", { limit: 1 })).nodes.length, 1);
  assert.equal((await search("", { limit: 1 })).truncated, true);
  await assert.rejects(impact(["../secret.ts"]), /repository-relative/);
  await assert.rejects(impact(["/etc/passwd"]), /repository-relative/);
  await assert.rejects(search("", { kind: "not-a-kind" }), /Invalid option/);

  // Read-time reconciliation handles additions, edits, deletes and same-name IDs.
  await writeFile(
    path.join(root, "src/a.ts"),
    "export function replacement() { return 3; }\n",
  );
  assert.ok(
    (await search("replacement")).nodes.some(
      (node) => node.filePath === "src/a.ts",
    ),
  );
  assert.ok(
    !(await search("same")).nodes.some((node) => node.filePath === "src/a.ts"),
  );
  await unlink(path.join(root, "src/b.ts"));
  assert.equal(
    (await search("", { path: "src/b.ts" })).nodes.length,
    0,
    "deleted files are removed on sync",
  );
  const synced = await index("sync");
  assert.equal(
    synced.filesErrored,
    0,
    "incremental SyncResult uses failedFilePaths, not IndexResult.errors",
  );
  assert.equal(synced.status.stale, false);
  const rebuilt = await index();
  assert.equal(
    rebuilt.status.nodeCount,
    synced.status.nodeCount,
    "full rebuild and incremental index converge",
  );
  assert.equal(rebuilt.status.edgeCount, synced.status.edgeCount);
  assert.equal((await search("", { path: "src/b.ts" })).nodes.length, 0);
  console.log(
    "CodeGraph: native AST extraction, resolved identity, transitive impact, filters, SQLite, symlink guard, rebuild and incremental sync passed",
  );
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
}
