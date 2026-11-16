"use client";

import {
  FileCode2,
  GitBranch,
  Network,
  RefreshCw,
  Search,
  Share2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { notify } from "@/components/dev-flow/notify";
import PageHeader from "@/components/dev-flow/page-header";
import { dfGet, dfPost, useDevFlow } from "@/components/dev-flow/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type {
  GraphNode as SymbolRow,
  GraphEdge as RelationRow,
  GraphSearch as SymbolSearchResponse,
  GraphIndex as RebuildSummary,
  GraphImpact as ImpactReport,
  GraphStatus,
} from "@/lib/dev-flow/codegraph-types";
import type { WorkspaceStatus } from "@/lib/dev-flow/types";

type ExcerptRow = SymbolSearchResponse["excerpts"][number];

interface CommittedFilters {
  query: string;
  kind: string;
  language: string;
  path: string;
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 8) : "—";
}

function linesLabel(row: SymbolRow): string {
  return `${row.startLine ?? "?"}-${row.endLine ?? "?"}`;
}

export default function DevFlowCodeGraphPage() {
  const { repoId } = useDevFlow();
  return <CodeGraphWorkspace key={repoId ?? "none"} repoId={repoId} />;
}

function CodeGraphWorkspace({ repoId }: { repoId: string | null }) {
  const t = useTranslations("devFlow.codeGraph");
  const tCode = useTranslations("devFlow.code");

  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [indexErrors, setIndexErrors] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [graphStatus, setGraphStatus] = useState<GraphStatus | null>(null);
  const [truncated, setTruncated] = useState(false);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [language, setLanguage] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [committed, setCommitted] = useState<CommittedFilters | null>(null);
  const [symbols, setSymbols] = useState<SymbolRow[]>([]);
  const [relations, setRelations] = useState<RelationRow[]>([]);
  const [documents, setDocuments] = useState<ExcerptRow[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(false);

  const [impactInput, setImpactInput] = useState("");
  const [impact, setImpact] = useState<ImpactReport | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!repoId) {
        setWorkspace(null);
        setStatusLoading(false);
        return;
      }
      setStatusLoading(true);
      setIndexErrors([]);
      setGraphStatus(null);
      setImpactInput("");
      setQuery("");
      setKind("");
      setLanguage("");
      setPathFilter("");
      setCommitted(null);
      setSymbols([]);
      setRelations([]);
      setDocuments([]);
      setImpact(null);
      try {
        const ws = await dfGet<WorkspaceStatus>(`/repos/${repoId}/workspace`);
        if (!cancelled) {
          setWorkspace(ws);
        }
      } catch {
        if (!cancelled) {
          setWorkspace(null);
        }
      } finally {
        if (!cancelled) {
          setStatusLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!repoId || !workspace?.cloned) {
        setSymbols([]);
        setRelations([]);
        setDocuments([]);
        return;
      }
      setSymbolsLoading(true);
      try {
        const params = new URLSearchParams();
        if (committed?.query) {
          params.set("query", committed.query);
        }
        if (committed?.kind) {
          params.set("kind", committed.kind);
        }
        if (committed?.language) {
          params.set("language", committed.language);
        }
        if (committed?.path) {
          params.set("path", committed.path);
        }
        params.set("limit", "100");
        const result = await dfGet<SymbolSearchResponse>(
          `/repos/${repoId}/code-graph?${params.toString()}`,
        );
        if (!cancelled) {
          setSymbols(result.nodes);
          setGraphStatus(result.status);
          setTruncated(result.truncated);
          setRelations(result.edges);
          setDocuments(result.excerpts);
        }
      } catch (e) {
        if (!cancelled) {
          setSymbols([]);
          setRelations([]);
          setDocuments([]);
          notify.error(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) {
          setSymbolsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId, workspace?.cloned, committed, reloadKey]);

  const handleSearch = () => {
    if (busy || !cloned) {
      return;
    }
    setCommitted({
      query: query.trim(),
      kind: kind.trim(),
      language: language.trim(),
      path: pathFilter.trim(),
    });
  };

  const handleRebuild = async (action: "rebuild" | "sync") => {
    if (!repoId || busy || !cloned) {
      return;
    }
    setRebuilding(true);
    try {
      const result = await dfPost<RebuildSummary>(
        `/repos/${repoId}/code-graph`,
        { action },
      );
      setIndexErrors(result.errors);
      setGraphStatus(result.status);
      setImpact(null);
      if (result.filesErrored === 0 && result.status.state === "complete") {
        notify.success(
          t("rebuilt", {
            files: result.status.fileCount,
            symbols: result.status.nodeCount,
            relations: result.status.edgeCount,
          }),
        );
      } else {
        notify.error(t("indexIncomplete", { count: result.filesErrored }));
      }
      setReloadKey((key) => key + 1);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRebuilding(false);
    }
  };

  const handleImpact = async () => {
    const files = impactInput.trim();
    if (!repoId || !files || busy || !cloned) {
      return;
    }
    setImpactLoading(true);
    setImpact(null);
    try {
      const result = await dfGet<ImpactReport>(
        `/repos/${repoId}/code-graph/impact?files=${encodeURIComponent(files)}`,
      );
      setImpact(result);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
    } finally {
      setImpactLoading(false);
    }
  };

  const cloned = workspace?.cloned ?? false;
  const busy = rebuilding || symbolsLoading || impactLoading;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader title={t("title")} />

      {statusLoading ? (
        <Skeleton className="h-28 rounded-xl" />
      ) : (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Network className="size-4" />
              {t("title")}
              <Badge variant="outline">
                CodeGraph {graphStatus?.version ?? ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cloned ? (
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary" className="gap-1">
                  <GitBranch className="size-3" />
                  {workspace?.branch ?? "—"}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  {shortSha(workspace?.commitSha ?? null)}
                </Badge>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                {tCode("notCloned")}
              </p>
            )}
            <Button
              onClick={() => void handleRebuild("rebuild")}
              disabled={busy || !repoId || !cloned}
              size="sm"
            >
              {rebuilding ? (
                <Spinner className="size-3.5" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {rebuilding ? t("rebuilding") : t("rebuild")}
            </Button>
            <Button
              onClick={() => void handleRebuild("sync")}
              disabled={busy || !repoId || !cloned}
              size="sm"
              variant="outline"
            >
              {t("sync")}
            </Button>
            {indexErrors.length > 0 ? (
              <ul className="text-destructive list-inside list-disc text-xs">
                {indexErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            ) : null}
            {graphStatus?.initialized ? (
              <p className="text-muted-foreground text-xs">
                {t("graphStats", {
                  files: graphStatus.fileCount,
                  symbols: graphStatus.nodeCount,
                  relations: graphStatus.edgeCount,
                })}
                {graphStatus.stale ? ` · ${t("stale")}` : ` · ${t("fresh")}`}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {truncated ? (
          <p className="text-muted-foreground text-xs">{t("truncatedNote")}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            className="min-w-56 flex-1"
          />
          <Input
            placeholder={t("kindPlaceholder")}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            className="w-44"
          />
          <Input
            placeholder={t("languagePlaceholder")}
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            className="w-40"
          />
          <Input
            placeholder={t("pathPlaceholder")}
            aria-label={t("pathPlaceholder")}
            value={pathFilter}
            onChange={(event) => {
              setPathFilter(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSearch();
              }
            }}
            className="w-48"
          />
          <Button onClick={handleSearch} disabled={busy || !cloned}>
            {symbolsLoading ? (
              <Spinner className="size-4" />
            ) : (
              <Search className="size-4" />
            )}
            {t("search")}
          </Button>
        </div>

        {symbolsLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-5" />
          </div>
        ) : symbols.length > 0 ? (
          <div className="border-border bg-card overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left text-xs">
                  <th className="px-3 py-2 font-medium">{t("colName")}</th>
                  <th className="px-3 py-2 font-medium">{t("colKind")}</th>
                  <th className="px-3 py-2 font-medium">{t("colLanguage")}</th>
                  <th className="px-3 py-2 font-medium">{t("colPath")}</th>
                  <th className="px-3 py-2 font-medium">{t("colLines")}</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {symbols.map((symbol) => (
                  <tr key={symbol.id} className="hover:bg-accent/40">
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {symbol.name}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {symbol.kind}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-xs">
                      {symbol.language}
                    </td>
                    <td className="max-w-72 truncate px-3 py-1.5 font-mono text-xs">
                      {symbol.filePath}
                    </td>
                    <td className="text-muted-foreground px-3 py-1.5 text-xs tabular-nums">
                      {linesLabel(symbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : committed ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {t("noSymbols")}
          </p>
        ) : (
          <Empty className="border-border rounded-xl border border-dashed py-16">
            <EmptyMedia variant="icon">
              <Network />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
          </Empty>
        )}

        {relations.length > 0 ? (
          <div className="mt-5 space-y-2">
            <p className="text-muted-foreground text-xs font-medium">
              {t("relationsTitle", { count: relations.length })}
            </p>
            <div className="border-border bg-card overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-border border-b text-left text-xs">
                    <th className="px-3 py-2 font-medium">{t("colSource")}</th>
                    <th className="px-3 py-2 font-medium">
                      {t("colRelation")}
                    </th>
                    <th className="px-3 py-2 font-medium">{t("colTarget")}</th>
                    <th className="px-3 py-2 font-medium">
                      {t("colLocation")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {relations.map((relation) => (
                    <tr key={relation.id} className="hover:bg-accent/40">
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {relation.source.qualifiedName}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {relation.kind}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {relation.target.qualifiedName}
                        <span className="text-muted-foreground block text-[10px]">
                          {relation.target.filePath}:{relation.target.startLine}
                        </span>
                      </td>
                      <td className="text-muted-foreground max-w-72 truncate px-3 py-1.5 font-mono text-xs">
                        {relation.source.filePath}
                        {relation.line !== null ? `:${relation.line}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {documents.length > 0 ? (
          <div className="mt-5 space-y-2">
            <p className="text-muted-foreground text-xs font-medium">
              {t("documentsTitle", { count: documents.length })}
            </p>
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.nodeId}
                  className="border-border bg-card overflow-hidden rounded-lg border"
                >
                  <div className="border-border bg-muted/40 text-muted-foreground flex items-center gap-2 border-b px-3 py-1.5 font-mono text-xs">
                    <FileCode2 className="size-3.5 shrink-0" />
                    <span className="truncate">
                      {doc.filePath}:{doc.startLine}-{doc.endLine}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {doc.symbol}
                    </Badge>
                  </div>
                  <pre className="text-foreground/90 max-h-56 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre">
                    {doc.content}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Share2 className="size-4" />
            {t("impactTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder={t("impactPlaceholder")}
              value={impactInput}
              onChange={(e) => {
                setImpactInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleImpact();
                }
              }}
              className="flex-1 font-mono text-xs"
            />
            <Button
              onClick={() => void handleImpact()}
              disabled={busy || !impactInput.trim() || !repoId || !cloned}
              variant="outline"
            >
              {impactLoading ? (
                <Spinner className="size-4" />
              ) : (
                <Share2 className="size-4" />
              )}
              {t("impactRun")}
            </Button>
          </div>

          {impact?.truncated ? (
            <p className="text-muted-foreground text-xs">
              {t("truncatedNote")}
            </p>
          ) : null}
          {impact?.status.stale ? (
            <p className="text-muted-foreground text-xs">{t("stale")}</p>
          ) : null}
          {impact ? (
            impact.nodes.length === 0 && impact.dependents.length === 0 ? (
              <p className="text-muted-foreground py-2 text-center text-sm">
                {t("impactNone")}
              </p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">
                    {t("changedSymbols", { count: impact.nodes.length })}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {impact.nodes.map((symbol) => (
                      <Badge
                        key={symbol.id}
                        variant="secondary"
                        className="gap-1 font-mono text-[10px]"
                      >
                        {symbol.name}
                        <span className="text-muted-foreground font-normal">
                          {symbol.filePath}:{symbol.startLine ?? "?"}
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">
                    {t("dependents", { count: impact.dependents.length })}
                  </p>
                  {impact.dependents.length === 0 ? (
                    <p className="text-muted-foreground py-1 text-xs">
                      {t("impactNone")}
                    </p>
                  ) : (
                    <div className="border-border bg-card divide-border divide-y overflow-hidden rounded-lg border">
                      {impact.dependents.map((dependent, index) => (
                        <div
                          key={`${dependent.kind}:${dependent.source.filePath}:${dependent.source.qualifiedName}:${dependent.target.qualifiedName}:${index}`}
                          className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs"
                        >
                          <Badge variant="outline" className="text-[10px]">
                            {dependent.kind} ·{" "}
                            {t("hop", { depth: dependent.depth })}
                          </Badge>
                          <span className="font-mono">
                            {dependent.source.qualifiedName}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-mono">
                            {dependent.target.qualifiedName}
                          </span>
                          {dependent.source.filePath ? (
                            <span className="text-muted-foreground ml-auto truncate font-mono text-[10px]">
                              {dependent.source.filePath}
                              {dependent.line ? `:${dependent.line}` : ""}
                            </span>
                          ) : null}
                          {dependent.sameFile ? (
                            <Badge variant="outline" className="text-[10px]">
                              {t("sameFile")}
                            </Badge>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
