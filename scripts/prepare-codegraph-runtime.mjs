import { constants } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Flatten only the worker's runtime dependencies. Next's pnpm tracing aliases
// are private to the bundled server and cannot be resolved by a raw Node worker.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadPackage = createRequire(path.join(root, "package.json"));
const sdkManifest = loadPackage.resolve("@colbymchenry/codegraph/package.json");
const loadPlatform = createRequire(sdkManifest);
const platformName = `@colbymchenry/codegraph-${process.platform}-${process.arch}`;
const platformRoot = path.dirname(
  loadPlatform.resolve(`${platformName}/package.json`),
);
const sdkRoot = path.dirname(sdkManifest);
const zodRoot = path.dirname(loadPackage.resolve("zod/package.json"));
const generated = path.join(root, "generated");
await mkdir(generated, { recursive: true });
const staging = await mkdtemp(path.join(generated, ".codegraph-runtime-"));
const target = path.join(generated, "codegraph-runtime");
const copyOptions = {
  recursive: true,
  dereference: true,
  mode: constants.COPYFILE_FICLONE,
};
try {
  const sdkTarget = path.join(staging, "node_modules/@colbymchenry/codegraph");
  const platformTarget = path.join(staging, "node_modules", platformName);
  const zodTarget = path.join(staging, "node_modules/zod");
  await Promise.all([
    mkdir(sdkTarget, { recursive: true }),
    mkdir(platformTarget, { recursive: true }),
    mkdir(zodTarget, { recursive: true }),
  ]);
  await Promise.all([
    cp(
      path.join(root, "scripts/codegraph-worker.mjs"),
      path.join(staging, "codegraph-worker.mjs"),
    ),
    cp(sdkManifest, path.join(sdkTarget, "package.json")),
    cp(path.join(sdkRoot, "npm-sdk.js"), path.join(sdkTarget, "npm-sdk.js")),
    cp(
      path.join(platformRoot, "package.json"),
      path.join(platformTarget, "package.json"),
    ),
    cp(
      path.join(platformRoot, "lib"),
      path.join(platformTarget, "lib"),
      copyOptions,
    ),
    cp(
      path.join(zodRoot, "package.json"),
      path.join(zodTarget, "package.json"),
    ),
    cp(path.join(zodRoot, "v4"), path.join(zodTarget, "v4"), copyOptions),
  ]);
  await writeFile(
    path.join(staging, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  // Verify the copied loader from its new layout, without a user's bundle cache.
  const runtime = createRequire(path.join(staging, "package.json"));
  const sdk = runtime("@colbymchenry/codegraph");
  if (typeof sdk.CodeGraph?.open !== "function") {
    throw new Error("Invalid CodeGraph runtime package");
  }
  const installed = JSON.parse(await readFile(sdkManifest, "utf8"));
  await rm(target, { recursive: true, force: true });
  await rename(staging, target);
  console.log(
    `Prepared CodeGraph ${installed.version} runtime (${process.platform}-${process.arch}); bundled Node/CLI executables excluded.`,
  );
} finally {
  await rm(staging, { recursive: true, force: true });
}
