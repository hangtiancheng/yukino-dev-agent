import { prisma } from "@/lib/db";
import { indexCodeGraph } from "@/lib/dev-flow/code-graph";

/** Rebuild derived graphs before discarding the obsolete PostgreSQL tables. */
async function main() {
  const repos = await prisma.repository.findMany({
    orderBy: { createdAt: "asc" },
  });
  let failures = 0;
  for (const repo of repos) {
    console.log(`Indexing ${repo.fullName} with CodeGraph…`);
    try {
      const result = await indexCodeGraph(repo.id, "rebuild");
      if (
        result.filesErrored > 0 ||
        result.status.stale ||
        result.status.state !== "complete"
      ) {
        throw new Error(
          `Incomplete index: ${result.filesErrored} file errors. ${result.errors.join("; ")}`,
        );
      }
      console.log(
        `${repo.fullName}: ${result.status.fileCount} files, ${result.status.nodeCount} nodes, ${result.status.edgeCount} edges`,
      );
    } catch (error) {
      failures += 1;
      console.error(
        `${repo.fullName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (failures > 0) {
    throw new Error(
      `${failures} repositories could not be indexed. Fix their checkouts and rerun; legacy tables have not been removed.`,
    );
  }
  await prisma.$transaction([
    prisma.$executeRaw`DROP TABLE IF EXISTS "CodeRelation"`,
    prisma.$executeRaw`DROP TABLE IF EXISTS "CodeSymbol"`,
  ]);
  console.log(
    `Migrated ${repos.length} repository graphs; removed CodeRelation and CodeSymbol.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
