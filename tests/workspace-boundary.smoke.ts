import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { discoverProjectDocs } from "@/lib/dev-flow/project-index";
import { listFiles, readCodeFile, searchCode } from "@/lib/dev-flow/workspace";

const root = await mkdtemp(path.join(os.tmpdir(), "workspace-boundary-"));
const outside = await mkdtemp(path.join(os.tmpdir(), "workspace-secret-"));
try {
  await writeFile(
    path.join(outside, "secret.ts"),
    "export const forbidden = 'private';",
  );
  await writeFile(
    path.join(root, "safe.ts"),
    "export const visible = 'public';",
  );
  await writeFile(path.join(root, ".env.staging"), "SECRET=private");
  await symlink(path.join(outside, "secret.ts"), path.join(root, "escape.ts"));
  await symlink(outside, path.join(root, "escape-dir"));
  await symlink(path.join(root, ".env.staging"), path.join(root, "alias.ts"));
  await mkdir(path.join(root, ".codegraph"));
  await writeFile(
    path.join(root, ".codegraph/private.ts"),
    "export const hidden = true;",
  );
  await writeFile(path.join(root, ".codegraph/README.md"), "# Native metadata");
  await symlink(path.join(root, ".codegraph"), path.join(root, "index-alias"));
  await assert.rejects(readCodeFile(root, "escape.ts"), /outside/);
  await assert.rejects(listFiles(root, "escape-dir"), /outside/);
  await assert.rejects(searchCode(root, "private", "escape-dir"), /outside/);
  await assert.rejects(readCodeFile(root, "alias.ts"), /secret config/);
  await assert.rejects(listFiles(root, "index-alias"), /skipped directory/);
  await assert.rejects(readCodeFile(root, ".env.staging"), /secret config/);
  assert.ok((await readCodeFile(root, "safe.ts")).content.includes("visible"));
  assert.ok(
    !(await listFiles(root, ".")).some(
      (entry) =>
        entry.path.includes(".codegraph") || entry.path.includes(".env"),
    ),
  );
  assert.equal((await searchCode(root, "forbidden")).length, 0);
  assert.ok(
    !(await discoverProjectDocs(root)).some((candidate) =>
      candidate.rel.startsWith(".codegraph"),
    ),
    "RAG project indexing excludes CodeGraph artifacts",
  );
  console.log(
    "Workspace boundary: external symlinks, secret aliases and native index directories are blocked",
  );
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
}
