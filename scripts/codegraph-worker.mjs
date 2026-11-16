// @ts-check
// This is a separate Node process: native parsing/WASM/SQLite never block Next.js.
import { createRequire } from "node:module";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod/v4";

// The published SDK is CommonJS; named ESM imports fail at runtime.
const loadNative = createRequire(import.meta.url);
/** @type {typeof import('@colbymchenry/codegraph')} */
const sdk = loadNative("@colbymchenry/codegraph");
const {
  CodeGraph,
  NODE_KINDS,
  LANGUAGES,
  FileLock,
  getCodeGraphDir,
  setLogger,
  silentLogger,
} = sdk;
const { version } = z
  .object({ version: z.string() })
  .parse(loadNative("@colbymchenry/codegraph/package.json"));

setLogger(silentLogger);
// Keep the JSON wire channel separate from dependency diagnostics.
console.log = (...args) => console.error(...args);
console.info = (...args) => console.error(...args);

const RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("index"),
    checkout: z.string(),
    mode: z.enum(["rebuild", "sync"]),
  }),
  z.object({
    action: z.literal("search"),
    checkout: z.string(),
    query: z.string().max(200).default(""),
    kind: z.enum(NODE_KINDS).optional(),
    language: z.enum(LANGUAGES).optional(),
    path: z.string().max(400).optional(),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  z.object({
    action: z.literal("impact"),
    checkout: z.string(),
    files: z.array(z.string().min(1).max(400)).min(1).max(50),
    depth: z.number().int().min(1).max(3).default(2),
  }),
]);

/** CodeGraph can revive gitignored paths and follow symlinks. Check the
 * source tree without following links, including ignored directories, so a
 * codegraph.json include override cannot bypass the workspace boundary.
 * @param {string} root
 */
async function assertRepositoryBoundary(root) {
  const skip = new Set([
    ".git",
    "node_modules",
    ".next",
    ".nuxt",
    "dist",
    "build",
    "coverage",
    ".venv",
    "venv",
    "__pycache__",
  ]);
  /** @param {string} directory */
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (skip.has(entry.name) || entry.name.startsWith(".codegraph")) {
        continue;
      }
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
        continue;
      }
      if (!entry.isSymbolicLink()) {
        continue;
      }
      const target = await realpath(file).catch(() => null);
      if (!target) {
        continue;
      }
      const relative = path.relative(root, target);
      const display = path.relative(root, file);
      if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error(
          `Repository path escapes the checkout through a symbolic link: ${display}`,
        );
      }
      if (
        relative
          .split(path.sep)
          .some(
            (part) =>
              skip.has(part) ||
              part.startsWith(".env") ||
              part.startsWith(".codegraph") ||
              [".npmrc", ".pypirc"].includes(part),
          )
      ) {
        throw new Error(
          `Repository symbolic link targets a protected file or directory: ${display}`,
        );
      }
    }
  };
  await walk(root);
}

/** @param {import('@colbymchenry/codegraph').CodeGraph | null} graph */
function status(graph) {
  const stats = graph?.getStats();
  const failedFiles =
    graph
      ?.getFiles()
      .filter((file) =>
        file.errors?.some((error) => error.severity === "error"),
      ).length ?? 0;
  const changed = graph?.getChangedFiles();
  const pendingFiles = changed
    ? changed.added.length + changed.modified.length + changed.removed.length
    : 0;
  return {
    engine: "codegraph",
    version,
    initialized: graph !== null,
    state: graph?.getIndexState() ?? null,
    stale:
      graph !== null &&
      (graph.isIndexStale() ||
        pendingFiles > 0 ||
        failedFiles > 0 ||
        graph.getPendingReferenceCount() > 0 ||
        graph.getIndexState() !== "complete"),
    lastIndexedAt: graph?.getLastIndexedAt() ?? null,
    fileCount: stats?.fileCount ?? 0,
    nodeCount: stats?.nodeCount ?? 0,
    edgeCount: stats?.edgeCount ?? 0,
    pendingFiles,
    failedFiles,
  };
}

/** @param {import('@colbymchenry/codegraph').Node} node */
function nodeView(node) {
  return {
    id: node.id,
    name: node.name,
    qualifiedName: node.qualifiedName,
    kind: node.kind,
    language: node.language,
    filePath: node.filePath,
    startLine: node.startLine,
    endLine: node.endLine,
    ...(node.signature ? { signature: node.signature } : {}),
  };
}

/** @param {import('@colbymchenry/codegraph').Edge} edge */
function edgeKey(edge) {
  return JSON.stringify([
    edge.source,
    edge.target,
    edge.kind,
    edge.line ?? null,
    edge.column ?? null,
  ]);
}

/**
 * @param {import('@colbymchenry/codegraph').CodeGraph} graph
 * @param {import('@colbymchenry/codegraph').Edge[]} edges
 */
function edgeViews(graph, edges) {
  const nodes = graph.getNodesByIds([
    ...new Set(edges.flatMap((edge) => [edge.source, edge.target])),
  ]);
  return edges.flatMap((edge) => {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) {
      return [];
    }
    return [
      {
        id: edgeKey(edge),
        source: nodeView(source),
        target: nodeView(target),
        kind: edge.kind,
        line: edge.line ?? null,
        provenance: edge.provenance ?? null,
      },
    ];
  });
}

/** @param {string} file */
function normalizedPath(file) {
  const value = file.trim().replaceAll("\\", "/");
  if (
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").includes("..")
  ) {
    throw new Error(
      "Files must be repository-relative paths without traversal",
    );
  }
  const normalized = path.posix.normalize(value);
  if (!normalized || normalized === ".") {
    throw new Error("File path is required");
  }
  return normalized;
}

/**
 * Read only bounded, in-root source. Never return config secrets or index files,
 * even if an existing graph contains a node pointing at one.
 * @param {string} root
 * @param {import('@colbymchenry/codegraph').Node} node
 */
async function excerpt(root, node) {
  const file = normalizedPath(node.filePath);
  if (
    file
      .split("/")
      .some(
        (part) =>
          part.startsWith(".env") ||
          part.startsWith(".codegraph") ||
          [".git", ".npmrc", ".pypirc", "node_modules"].includes(part),
      )
  ) {
    return null;
  }
  const absolute = await realpath(path.resolve(root, file));
  const relative = path.relative(root, absolute);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  const handle = await open(absolute, "r");
  try {
    if ((await handle.stat()).size > 1024 * 1024) {
      return null;
    }
    const data = await handle.readFile();
    if (data.subarray(0, 4096).includes(0)) {
      return null;
    }
    const lines = data.toString("utf8").split("\n");
    const startLine = Math.max(1, node.startLine);
    const endLine = Math.min(node.endLine, startLine + 19, lines.length);
    return {
      nodeId: node.id,
      filePath: file,
      symbol: node.name,
      startLine,
      endLine,
      content: lines
        .slice(startLine - 1, endLine)
        .join("\n")
        .slice(0, 3000),
    };
  } finally {
    await handle.close();
  }
}

/**
 * @param {import('@colbymchenry/codegraph').CodeGraph | null} graph
 * @param {Extract<import('zod/v4').infer<typeof RequestSchema>, {action:'search'}>} request
 */
async function search(graph, request) {
  if (!graph) {
    return {
      status: status(null),
      nodes: [],
      edges: [],
      excerpts: [],
      truncated: false,
    };
  }
  const options = {
    ...(request.kind ? { kinds: [request.kind] } : {}),
    ...(request.language ? { languages: [request.language] } : {}),
    limit: request.limit + 1,
  };
  // The SDK's includePatterns option is not implemented in 1.6.2. Resolve the
  // full matching file set before applying the result cap so path filters cannot
  // silently lose a symbol that ranked below unrelated files.
  const needle = request.query.toLowerCase();
  const hits = request.path
    ? graph
        .getNodesInFiles(
          graph
            .getFiles()
            .filter((file) => file.path.includes(request.path ?? ""))
            .map((file) => file.path),
        )
        .filter(
          (node) =>
            (!request.kind || node.kind === request.kind) &&
            (!request.language || node.language === request.language) &&
            (!needle ||
              `${node.name} ${node.qualifiedName} ${node.filePath}`
                .toLowerCase()
                .includes(needle)),
        )
        .sort(
          (a, b) =>
            Number(b.name.toLowerCase() === needle) -
              Number(a.name.toLowerCase() === needle) ||
            a.filePath.localeCompare(b.filePath) ||
            a.startLine - b.startLine,
        )
        .slice(0, request.limit + 1)
        .map((node) => ({ node, score: 1 }))
    : graph.searchNodes(request.query, options);
  const nodes = hits.slice(0, request.limit).map((hit) => hit.node);
  const ids = nodes.map((node) => node.id);
  const unique = new Map(
    [...graph.getIncomingEdgesTo(ids), ...graph.getOutgoingEdgesFrom(ids)].map(
      (edge) => [edgeKey(edge), edge],
    ),
  );
  const edges = [...unique.values()];
  const excerpts = (
    await Promise.all(
      nodes
        .slice(0, 20)
        .map((node) => excerpt(request.checkout, node).catch(() => null)),
    )
  ).filter((entry) => entry !== null);
  return {
    status: status(graph),
    nodes: nodes.map(nodeView),
    edges: edgeViews(graph, edges.slice(0, 400)),
    excerpts,
    truncated:
      hits.length > request.limit || edges.length > 400 || nodes.length > 20,
  };
}

/**
 * @param {import('@colbymchenry/codegraph').CodeGraph | null} graph
 * @param {Extract<import('zod/v4').infer<typeof RequestSchema>, {action:'impact'}>} request
 */
function impact(graph, request) {
  const files = [...new Set(request.files.map(normalizedPath))];
  if (!graph) {
    return {
      status: status(null),
      files,
      nodes: [],
      dependents: [],
      truncated: false,
    };
  }
  const nodes = graph.getNodesInFiles(files);
  const changed = new Set(files);
  const visited = new Set(nodes.map((node) => node.id));
  let frontier = [...visited];
  /** @type {Array<ReturnType<typeof edgeViews>[number] & {sameFile: boolean, depth: number}>} */
  const dependents = [];
  const seen = new Set();
  let truncated = false;
  for (
    let depth = 1;
    depth <= request.depth && frontier.length > 0;
    depth += 1
  ) {
    const incoming = graph
      .getIncomingEdgesTo(frontier)
      .filter(
        (edge) => edge.kind !== "contains" && edge.source !== edge.target,
      );
    const next = new Set();
    for (const edge of edgeViews(graph, incoming)) {
      if (seen.has(edge.id)) {
        continue;
      }
      seen.add(edge.id);
      if (dependents.length >= 1000) {
        truncated = true;
        break;
      }
      dependents.push({
        ...edge,
        sameFile: changed.has(edge.source.filePath),
        depth,
      });
      if (!visited.has(edge.source.id)) {
        visited.add(edge.source.id);
        next.add(edge.source.id);
      }
    }
    if (truncated) {
      break;
    }
    frontier = [...next];
  }
  return {
    status: status(graph),
    files,
    nodes: nodes.slice(0, 1000).map(nodeView),
    dependents,
    truncated: truncated || nodes.length > 1000,
  };
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 32_000) {
      throw new Error("CodeGraph request is too large");
    }
  }
  const request = RequestSchema.parse(JSON.parse(input));
  request.checkout = await realpath(request.checkout);
  await assertRepositoryBoundary(request.checkout);
  // Every app process takes this lock for its entire operation, including DB
  // replacement. CodeGraph retains its own lock for indexing and CLI interop.
  const directory = getCodeGraphDir(request.checkout);
  await mkdir(directory, { recursive: true });
  for (const name of [
    "",
    "codegraph.db",
    "codegraph.db-wal",
    "codegraph.db-shm",
    "devflow.lock",
    "codegraph.lock",
  ]) {
    const entry = await lstat(path.join(directory, name)).catch(() => null);
    if (entry?.isSymbolicLink()) {
      throw new Error("CodeGraph index paths must not be symbolic links");
    }
  }
  const operationLock = new FileLock(path.join(directory, "devflow.lock"));
  operationLock.acquire();
  /** @type {import('@colbymchenry/codegraph').CodeGraph | null} */
  let graph = null;
  try {
    if (request.action === "index") {
      const initialized = CodeGraph.isInitialized(request.checkout);
      const rebuilding = request.mode === "rebuild";
      if (initialized && rebuilding) {
        const indexLock = new FileLock(path.join(directory, "codegraph.lock"));
        indexLock.withLock(() => {});
        graph = await CodeGraph.recreate(request.checkout);
      } else {
        graph = initialized
          ? await CodeGraph.open(request.checkout, { sync: false })
          : await CodeGraph.init(request.checkout, { index: false });
      }
      if (
        !rebuilding &&
        initialized &&
        (graph.getIndexState() !== "complete" || graph.isIndexStale())
      ) {
        graph.close();
        graph = null;
        const indexLock = new FileLock(path.join(directory, "codegraph.lock"));
        indexLock.withLock(() => {});
        graph = await CodeGraph.recreate(request.checkout);
      }
      if (
        rebuilding ||
        graph.getIndexState() !== "complete" ||
        graph.isIndexStale()
      ) {
        const result = await graph.indexAll();
        if (
          !result.success &&
          result.errors.some((error) => /lock/i.test(error.message))
        ) {
          throw new Error("CodeGraph index is locked by another process");
        }
        return {
          status: status(graph),
          filesErrored: result.filesErrored,
          errors: result.errors
            .slice(0, 20)
            .map((error) => `${error.filePath ?? "index"}: ${error.message}`),
        };
      }
      const result = await graph.sync();
      return {
        status: status(graph),
        filesErrored: result.failedFilePaths?.length ?? 0,
        errors: (result.failedFilePaths ?? [])
          .slice(0, 20)
          .map((file) => `Failed to index ${file}`),
      };
    }
    if (CodeGraph.isInitialized(request.checkout)) {
      graph = await CodeGraph.open(request.checkout, { sync: false });
      // Queries reconcile checkout changes, including git pull/branch switches.
      // An interrupted/old full index must be explicitly rebuilt, never called complete.
      if (graph.getIndexState() === "complete" && !graph.isIndexStale()) {
        await graph.sync();
      }
    }
    return request.action === "search"
      ? await search(graph, request)
      : impact(graph, request);
  } finally {
    graph?.close();
    operationLock.release();
  }
}

main()
  .then((data) => {
    writeFileSync(1, JSON.stringify({ ok: true, data }));
    process.exit(0);
  })
  .catch((error) => {
    const message =
      error instanceof Error ? error.message : "CodeGraph operation failed";
    const status =
      error instanceof z.ZodError ||
      message.includes("repository-relative") ||
      message === "File path is required" ||
      message.includes("escapes the checkout") ||
      message.includes("targets a protected") ||
      message.includes("must not be symbolic")
        ? 400
        : /lock|already.*index/i.test(message)
          ? 409
          : 500;
    writeFileSync(1, JSON.stringify({ ok: false, error: message, status }));
    process.exit(1);
  });
