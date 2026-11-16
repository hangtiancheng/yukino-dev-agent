import { z } from "zod/v4";

import { indexCodeGraph, searchCodeGraph } from "@/lib/dev-flow/code-graph";
import { GraphSearchQuerySchema } from "@/lib/dev-flow/codegraph-types";
import { errorMessage, fail, failRaw, ok } from "@/lib/dev-flow/http";
import { WorkspaceError } from "@/lib/dev-flow/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

export { OPTIONS } from "@/lib/dev-flow/http";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const IndexBodySchema = z
  .object({ action: z.enum(["rebuild", "sync"]) })
  .strict();

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const parsed = GraphSearchQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      return await fail(400, "invalidQuery", {
        detail: parsed.error.issues[0]?.message ?? "invalid parameters",
      });
    }
    return ok(await searchCodeGraph(id, parsed.data));
  } catch (e) {
    if (e instanceof WorkspaceError) {
      return failRaw(e.status, e.message);
    }
    return failRaw(500, errorMessage(e));
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = IndexBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return fail(400, "invalidRequest", {
      detail: "action must be rebuild or sync",
    });
  }
  try {
    return ok(await indexCodeGraph(id, parsed.data.action));
  } catch (e) {
    if (e instanceof WorkspaceError) {
      return failRaw(e.status, e.message);
    }
    return failRaw(500, errorMessage(e));
  }
}
