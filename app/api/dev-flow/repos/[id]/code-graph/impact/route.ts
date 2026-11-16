import { z } from "zod/v4";

import { impactForFiles } from "@/lib/dev-flow/code-graph";
import { errorMessage, fail, failRaw, ok } from "@/lib/dev-flow/http";
import { WorkspaceError } from "@/lib/dev-flow/workspace";

export const runtime = "nodejs";
export const maxDuration = 120;

export { OPTIONS } from "@/lib/dev-flow/http";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ImpactQuerySchema = z.object({
  files: z.string().trim().min(1).max(20000),
  depth: z.coerce.number().int().min(1).max(3).default(2),
});

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const parsed = ImpactQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      return await fail(400, "invalidQuery", {
        detail: "files must be a comma-separated list of repo-relative paths",
      });
    }
    const files = parsed.data.files
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (files.length === 0 || files.length > 50) {
      return await fail(400, "invalidQuery", {
        detail: "files must contain between 1 and 50 paths",
      });
    }
    return ok(await impactForFiles(id, files, parsed.data.depth));
  } catch (e) {
    if (e instanceof WorkspaceError) {
      return failRaw(e.status, e.message);
    }
    return failRaw(500, errorMessage(e));
  }
}
