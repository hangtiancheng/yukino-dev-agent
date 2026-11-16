import { z } from "zod/v4";

// Wire types are independent of the native SDK so client components never load it.
export const GraphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  qualifiedName: z.string(),
  kind: z.string(),
  language: z.string(),
  filePath: z.string(),
  startLine: z.number().int(),
  endLine: z.number().int(),
  signature: z.string().optional(),
});

export const GraphEdgeSchema = z.object({
  id: z.string(),
  source: GraphNodeSchema,
  target: GraphNodeSchema,
  kind: z.string(),
  line: z.number().int().nullable(),
  provenance: z.string().nullable(),
});

export const GraphStatusSchema = z.object({
  engine: z.literal("codegraph"),
  version: z.string(),
  initialized: z.boolean(),
  state: z.enum(["complete", "partial", "failed", "indexing"]).nullable(),
  stale: z.boolean(),
  lastIndexedAt: z.number().nullable(),
  fileCount: z.number().int().nonnegative(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  pendingFiles: z.number().int().nonnegative(),
  failedFiles: z.number().int().nonnegative(),
});

export const GraphSearchSchema = z.object({
  status: GraphStatusSchema,
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  excerpts: z.array(
    z.object({
      nodeId: z.string(),
      filePath: z.string(),
      symbol: z.string(),
      startLine: z.number().int(),
      endLine: z.number().int(),
      content: z.string(),
    }),
  ),
  truncated: z.boolean(),
});

export const GraphImpactSchema = z.object({
  status: GraphStatusSchema,
  files: z.array(z.string()),
  nodes: z.array(GraphNodeSchema),
  dependents: z.array(
    GraphEdgeSchema.extend({ sameFile: z.boolean(), depth: z.number().int() }),
  ),
  truncated: z.boolean(),
});

export const GraphIndexSchema = z.object({
  status: GraphStatusSchema,
  filesErrored: z.number().int().nonnegative(),
  errors: z.array(z.string()),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphStatus = z.infer<typeof GraphStatusSchema>;
export type GraphSearch = z.infer<typeof GraphSearchSchema>;
export type GraphImpact = z.infer<typeof GraphImpactSchema>;
export type GraphIndex = z.infer<typeof GraphIndexSchema>;

export const GraphSearchQuerySchema = z.object({
  query: z.string().trim().max(200).default(""),
  kind: z.string().trim().max(40).optional(),
  language: z.string().trim().max(40).optional(),
  path: z.string().trim().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type GraphSearchQuery = z.input<typeof GraphSearchQuerySchema>;
