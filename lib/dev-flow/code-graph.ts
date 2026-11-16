import { runCodeGraph } from "./codegraph-client";
import {
  GraphImpactSchema,
  GraphIndexSchema,
  GraphSearchQuerySchema,
  GraphSearchSchema,
  type GraphSearchQuery,
} from "./codegraph-types";
import { getRepoOrThrow, requireCheckout } from "./workspace";

export type { GraphImpact as ImpactReport } from "./codegraph-types";

export async function indexCodeGraph(repoId: string, mode: "rebuild" | "sync") {
  const checkout = await requireCheckout(await getRepoOrThrow(repoId));
  return runCodeGraph(checkout, { action: "index", mode }, GraphIndexSchema);
}

export async function searchCodeGraph(
  repoId: string,
  filters: GraphSearchQuery = {},
) {
  const checkout = await requireCheckout(await getRepoOrThrow(repoId));
  return runCodeGraph(
    checkout,
    { action: "search", ...GraphSearchQuerySchema.parse(filters) },
    GraphSearchSchema,
  );
}

export async function impactForFiles(
  repoId: string,
  files: string[],
  depth = 2,
) {
  const checkout = await requireCheckout(await getRepoOrThrow(repoId));
  const uniqueFiles = [...new Set(files)];
  const report = await runCodeGraph(
    checkout,
    { action: "impact", files: uniqueFiles.slice(0, 50), depth },
    GraphImpactSchema,
  );
  return { ...report, truncated: report.truncated || uniqueFiles.length > 50 };
}
