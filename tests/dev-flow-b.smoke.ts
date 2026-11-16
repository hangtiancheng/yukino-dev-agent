import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chunkDocument } from "@/lib/dev-flow/chunking";
import {
  buildSummary,
  discoverProjectDocs,
} from "@/lib/dev-flow/project-index";

const checkout = await mkdtemp(path.join(os.tmpdir(), "project-discovery-"));
const readme =
  "# Project\n\nA typed operations assistant.\n\n## Usage\n\nRun the application locally.\n";
try {
  for (const directory of [
    "docs",
    ".github/workflows",
    "node_modules",
    ".codegraph",
    ".codegraph-alt",
    "src",
  ]) {
    await mkdir(path.join(checkout, directory), { recursive: true });
  }
  for (const [file, text] of Object.entries({
    "README.md": readme,
    "package.json": '{"name":"discovery-fixture"}',
    "tsconfig.json": '{"compilerOptions":{"strict":true}}',
    "settings.yaml": "enabled: true\n",
    "docs/guide.md": "# Guide\nStart here.\n",
    ".github/workflows/ci.yml": "name: CI\n",
    "node_modules/README.md": "excluded dependency",
    ".codegraph/README.md": "excluded index",
    ".codegraph-alt/README.md": "excluded sibling index",
    "docs/.env.staging.md": "excluded secret",
    "src/main.ts": "export const entry = true;",
  })) {
    await writeFile(path.join(checkout, file), text);
  }
  const docs = await discoverProjectDocs(checkout);
  const classified = new Map(docs.map((doc) => [doc.rel, doc]));
  assert.equal(classified.get("README.md")?.sourceType, "readme");
  assert.equal(classified.get("package.json")?.sourceType, "manifest");
  assert.equal(
    classified.get("tsconfig.json")?.sourceType,
    "config",
    "root config files must not be lost to dirname('.')",
  );
  assert.equal(classified.get("settings.yaml")?.tier, "support");
  assert.equal(classified.get("docs/guide.md")?.sourceType, "docs");
  assert.equal(
    classified.get(".github/workflows/ci.yml")?.sourceType,
    "config",
  );
  assert.equal(
    docs.length,
    6,
    "dependencies, graph artifacts, secrets and source code are excluded",
  );
  const summary = await buildSummary(checkout, docs);
  assert.deepEqual(summary.techStack, ["JavaScript/TypeScript", "TypeScript"]);
  assert.deepEqual(summary.sourceTypeCoverage, {
    readme: 1,
    manifest: 1,
    config: 3,
    docs: 1,
  });
  const chunks = chunkDocument(readme, "README.md", 800, 100);
  assert.ok(chunks.length > 0);
  assert.ok(
    chunks.some((chunk) => chunk.content.includes("operations assistant")),
  );
  console.log(
    "DEV_FLOW-B SMOKE OK: real temporary checkout, root configs, docs, manifests, CI, secret/index exclusion and chunking",
  );
} finally {
  await rm(checkout, { recursive: true, force: true });
}
