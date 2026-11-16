import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";

import { z } from "zod/v4";

import { WorkspaceError } from "./workspace";

const WorkerResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    status: z.number().int().min(400).max(599),
  }),
]);

const globalForGraph = globalThis as {
  codegraphJobs?: Map<string, Promise<unknown>>;
};
const jobs = (globalForGraph.codegraphJobs ??= new Map<
  string,
  Promise<unknown>
>());
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** Run the native engine outside the Next.js event loop, serialized per checkout. */
export async function runCodeGraph<T>(
  checkout: string,
  request: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const root = await realpath(checkout);
  // Bound public API backlog as well as the number of native indexing processes.
  if (!jobs.has(root) && jobs.size >= 2) {
    throw new WorkspaceError("CodeGraph is busy. Retry shortly.", 503);
  }
  // Reject concurrent operations for a checkout; the engine also holds a
  // cross-process lock for multi-instance deployments.
  if (jobs.has(root)) {
    throw new WorkspaceError(
      "CodeGraph is already processing this checkout. Retry shortly.",
      409,
    );
  }
  const job = invokeWorker(root, request).then((data) => schema.parse(data));
  jobs.set(root, job);
  try {
    return await job;
  } finally {
    if (jobs.get(root) === job) {
      jobs.delete(root);
    }
  }
}

function invokeWorker(
  checkout: string,
  request: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const worker =
      process.env.NODE_ENV === "production"
        ? path.join(
            process.cwd(),
            "generated",
            "codegraph-runtime",
            "codegraph-worker.mjs",
          )
        : path.join(process.cwd(), "scripts", "codegraph-worker.mjs");
    const child = spawn(process.execPath, ["--liftoff-only", worker], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        CODEGRAPH_TELEMETRY: "0",
        CODEGRAPH_NO_DAEMON: "1",
        CODEGRAPH_DIR: ".codegraph",
      },
    });
    let output = "";
    let bytes = 0;
    let failure: Error | null = null;
    const stop = (error: Error) => {
      failure ??= error;
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      } else {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(
      () => {
        stop(
          new WorkspaceError(
            "CodeGraph operation timed out. Retry or index a smaller checkout.",
            504,
          ),
        );
      },
      request.action === "index" ? 300_000 : 120_000,
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_OUTPUT_BYTES) {
        stop(new WorkspaceError("CodeGraph output exceeded its limit", 502));
        return;
      }
      output += chunk;
    });
    // Engine logs can include checkout content/paths. Do not return stderr to a public API.
    child.stderr.resume();
    child.stdin.on("error", () => {
      /* close/error below reports worker failure */
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (failure) {
        reject(failure);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(output);
        const result = WorkerResponseSchema.parse(parsed);
        if (!result.ok) {
          reject(new WorkspaceError(result.error, result.status));
          return;
        }
        resolve(result.data);
      } catch {
        reject(
          new WorkspaceError(
            "CodeGraph worker failed. Check the platform package and Node.js runtime.",
            502,
          ),
        );
      }
    });
    child.stdin.end(JSON.stringify({ ...request, checkout }));
  });
}
