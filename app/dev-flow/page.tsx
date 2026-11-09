"use client";

import {
  Activity,
  BookOpen,
  CircleDot,
  ClipboardCheck,
  FolderGit2,
  GitPullRequest,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { notify } from "@/components/dev-flow/notify";
import PageHeader from "@/components/dev-flow/page-header";
import { dfGet, dfPost, useDevFlow } from "@/components/dev-flow/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { DevFlowStats } from "@/lib/dev-flow/types";

const ISSUE_STATE_KEYS: Record<string, "open" | "closed" | undefined> = {
  open: "open",
  closed: "closed",
} as const;

const PR_STATE_KEYS: Record<string, "open" | "closed" | "merged" | undefined> =
  {
    open: "open",
    closed: "closed",
    merged: "merged",
  } as const;

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: typeof CircleDot;
  label: string;
  value: number;
  hint?: string;
  href?: string;
}) {
  const body = (
    <div className="group/stat bg-card hover:bg-accent/40 relative h-full px-5 py-5 transition-colors">
      <Icon
        className="text-muted-foreground absolute top-5 right-4 size-4"
        strokeWidth={1.75}
      />
      <div className="min-w-0">
        <div className="text-foreground pr-5 text-3xl leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        <div className="text-muted-foreground mt-3 text-xs">
          {label}
          {hint ? <span className="mt-1 block text-[11px]">{hint}</span> : null}
        </div>
      </div>
    </div>
  );
  return href ? (
    <Link
      href={href}
      className="focus-visible:ring-ring outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export default function DevFlowDashboard() {
  const { repoId, repos, reposLoading, refreshRepos } = useDevFlow();
  const t = useTranslations("devFlow.dashboard");
  const tb = useTranslations("devFlow.badges");
  const tc = useTranslations("common");
  const [stats, setStats] = useState<DevFlowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await dfGet<DevFlowStats>(
          repoId ? `/stats?repoId=${repoId}` : "/stats",
        );
        if (!cancelled) {
          setStats(data);
        }
      } catch {
        if (!cancelled) {
          setStats(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId, reloadKey]);

  const handleSync = async () => {
    if (!repoId) {
      return;
    }
    setSyncing(true);
    try {
      const result = await dfPost<{
        synced: { issues: number; pullRequests: number; workflowRuns: number };
      }>(`/repos/${repoId}/sync`, { limit: 30 });
      notify.success(
        t("synced", {
          issues: result.synced.issues,
          prs: result.synced.pullRequests,
          runs: result.synced.workflowRuns,
        }),
      );
      await refreshRepos();
      setReloadKey((k) => k + 1);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  if (!reposLoading && repos.length === 0) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeader title={t("title")} />
        <Empty className="border-border rounded-xl border border-dashed py-16">
          <EmptyMedia variant="icon">
            <FolderGit2 />
          </EmptyMedia>
          <EmptyTitle>{t("noReposTitle")}</EmptyTitle>
          <EmptyContent>
            <Link href="/dev-flow/repos">
              <Button>
                <Sparkles className="size-4" />
                {t("connectFirst")}
              </Button>
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title={t("title")}
        actions={
          <Button
            onClick={() => {
              void handleSync();
            }}
            disabled={syncing || !repoId}
            variant="outline"
          >
            <RefreshCw className={syncing ? "animate-spin" : ""} />
            {t("syncNow")}
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : !stats ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {tc("somethingWentWrong")}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setReloadKey((key) => key + 1);
              }}
            >
              <RefreshCw />
              {tc("retry")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3 xl:grid-cols-6">
            <StatCard
              icon={CircleDot}
              label={t("openIssues")}
              value={stats.openIssues}
              hint={t("closedCount", { count: stats.closedIssues })}
              href="/dev-flow/issues"
            />
            <StatCard
              icon={GitPullRequest}
              label={t("openPrs")}
              value={stats.openPrs}
              hint={t("mergedCount", { count: stats.mergedPrs })}
              href="/dev-flow/pulls"
            />
            <StatCard
              icon={Activity}
              label={t("failedRuns")}
              value={stats.failedRuns}
              hint={t("totalCount", { count: stats.totalRuns })}
              href="/dev-flow/ci"
            />
            <StatCard
              icon={BookOpen}
              label={t("knowledgeDocs")}
              value={stats.knowledgeDocs}
              href="/dev-flow/knowledge"
            />
            <StatCard
              icon={ClipboardCheck}
              label={t("pendingDrafts")}
              value={stats.pendingDrafts}
              href="/dev-flow/drafts"
            />
            <StatCard
              icon={Sparkles}
              label={t("aiAnalyses")}
              value={stats.analyses}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t("recentIssues")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.recentIssues.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t("noIssues")}
                  </p>
                ) : (
                  stats.recentIssues.map((issue) => {
                    const stateKey = ISSUE_STATE_KEYS[issue.state];
                    return (
                      <Link
                        key={issue.id}
                        href="/dev-flow/issues"
                        className="hover:bg-accent/50 block rounded-md px-2 py-1.5 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground shrink-0 font-mono text-xs">
                            #{issue.number}
                          </span>
                          <span className="text-foreground truncate text-sm">
                            {issue.title}
                          </span>
                          <Badge
                            variant={
                              issue.state === "open" ? "default" : "secondary"
                            }
                            className="ml-auto shrink-0"
                          >
                            {stateKey
                              ? tb(`issueState.${stateKey}`)
                              : issue.state}
                          </Badge>
                        </div>
                      </Link>
                    );
                  })
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t("recentPrs")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.recentPrs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("noPrs")}</p>
                ) : (
                  stats.recentPrs.map((pr) => {
                    const stateKey = PR_STATE_KEYS[pr.state];
                    return (
                      <Link
                        key={pr.id}
                        href="/dev-flow/pulls"
                        className="hover:bg-accent/50 block rounded-md px-2 py-1.5 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground shrink-0 font-mono text-xs">
                            #{pr.number}
                          </span>
                          <span className="text-foreground truncate text-sm">
                            {pr.title}
                          </span>
                          <Badge
                            variant="secondary"
                            className="ml-auto shrink-0"
                          >
                            {stateKey ? tb(`prState.${stateKey}`) : pr.state}
                          </Badge>
                        </div>
                      </Link>
                    );
                  })
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t("failedRuns")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.recentFailedRuns.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t("noFailedRuns")}
                  </p>
                ) : (
                  stats.recentFailedRuns.map((run) => (
                    <Link
                      key={run.id}
                      href="/dev-flow/ci"
                      className="hover:bg-accent/50 block rounded-md px-2 py-1.5 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-foreground truncate text-sm">
                          {run.name}
                        </span>
                        {run.headBranch ? (
                          <Badge
                            variant="outline"
                            className="ml-auto shrink-0 font-mono text-xs"
                          >
                            {run.headBranch}
                          </Badge>
                        ) : null}
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
