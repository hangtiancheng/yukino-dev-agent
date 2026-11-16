import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { z } from "zod/v4";

import { GraphIndexSchema } from "@/lib/dev-flow/codegraph-types";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const isolated = await mkdtemp(path.join(os.tmpdir(), "codegraph-runtime-"));
try {
  await execFileAsync(
    process.execPath,
    ["scripts/prepare-codegraph-runtime.mjs"],
    { cwd: root },
  );
  await cp(
    path.join(root, "generated/codegraph-runtime"),
    path.join(isolated, "runtime"),
    { recursive: true, mode: constants.COPYFILE_FICLONE },
  );
  const source = path.join(isolated, "source");
  await mkdir(source);
  await writeFile(
    path.join(source, "example.ts"),
    "export class RuntimeFixture {\n  execute() { return '中文'; }\n}\n",
  );
  const { stdout } = await new Promise<{ stdout: string }>(
    (resolve, reject) => {
      const child = execFile(
        process.execPath,
        ["--liftoff-only", path.join(isolated, "runtime/codegraph-worker.mjs")],
        {
          cwd: isolated,
          timeout: 60_000,
          maxBuffer: 1024 * 1024,
          env: {
            ...process.env,
            CODEGRAPH_TELEMETRY: "0",
            CODEGRAPH_NO_DAEMON: "1",
            CODEGRAPH_DIR: ".codegraph",
            CODEGRAPH_INSTALL_DIR: path.join(isolated, "empty-cache"),
            NODE_PATH: "",
          },
        },
        (error, stdout) => {
          if (error) {
            reject(
              new Error("Isolated CodeGraph worker failed", { cause: error }),
            );
          } else {
            resolve({ stdout });
          }
        },
      );
      child.stdin?.end(
        JSON.stringify({ checkout: source, action: "index", mode: "rebuild" }),
      );
    },
  );
  const result = z
    .object({ ok: z.literal(true), data: GraphIndexSchema })
    .parse(JSON.parse(stdout));
  assert.equal(result.data.status.state, "complete");
  assert.equal(result.data.status.stale, false);
  assert.ok(result.data.status.nodeCount >= 3);
  console.log(
    "CodeGraph runtime: copied artifact indexes source without project node_modules, pnpm links or a user bundle cache",
  );
} finally {
  await rm(isolated, { recursive: true, force: true });
}
