"use client";

import {
  Activity,
  BotMessageSquare,
  BookOpen,
  CircleDot,
  ClipboardCheck,
  Code2,
  FileText,
  FolderGit2,
  GitBranch,
  Boxes,
  LayoutDashboard,
  MessageSquareText,
  Network,
  Share2,
  Workflow,
  GitPullRequest,
  Snowflake,
  ThumbsUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, type Messages } from "next-intl";

import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

import { useDevFlow } from "./provider";

type DevFlowNavKey = keyof Messages["devFlow"]["nav"];

const NAV_GROUPS: {
  labelKey?: DevFlowNavKey;
  items: {
    href: string;
    labelKey: DevFlowNavKey;
    icon: typeof Activity;
  }[];
}[] = [
  {
    items: [
      { href: "/dev-flow", labelKey: "dashboard", icon: LayoutDashboard },
    ],
  },
  {
    labelKey: "delivery",
    items: [
      { href: "/dev-flow/issues", labelKey: "issues", icon: CircleDot },
      {
        href: "/dev-flow/pulls",
        labelKey: "pullRequests",
        icon: GitPullRequest,
      },
      { href: "/dev-flow/ci", labelKey: "ci", icon: Activity },
    ],
  },
  {
    labelKey: "intelligence",
    items: [
      { href: "/dev-flow/knowledge", labelKey: "knowledge", icon: BookOpen },
      { href: "/dev-flow/code", labelKey: "code", icon: Code2 },
      { href: "/dev-flow/code-graph", labelKey: "codeGraph", icon: Network },
      { href: "/dev-flow/graph", labelKey: "graph", icon: Share2 },
      {
        href: "/dev-flow/chat",
        labelKey: "agentChat",
        icon: MessageSquareText,
      },
      { href: "/dev-flow/reports", labelKey: "reports", icon: FileText },
      { href: "/dev-flow/feedback", labelKey: "feedback", icon: ThumbsUp },
    ],
  },
  {
    labelKey: "operations",
    items: [
      { href: "/dev-flow/drafts", labelKey: "drafts", icon: ClipboardCheck },
      {
        href: "/dev-flow/workflow-runs",
        labelKey: "workflowRuns",
        icon: Workflow,
      },
      { href: "/dev-flow/workspaces", labelKey: "workspaces", icon: Boxes },
      { href: "/dev-flow/repos", labelKey: "repos", icon: FolderGit2 },
    ],
  },
];

function RepoPicker() {
  const { repos, reposLoading, repoId, setRepoId } = useDevFlow();
  const t = useTranslations("devFlow");
  if (reposLoading) {
    return <Skeleton className="h-9 w-36 sm:w-56" />;
  }
  if (repos.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        render={<Link href="/dev-flow/repos" />}
      >
        <GitBranch className="size-3.5" />
        {t("connectRepo")}
      </Button>
    );
  }
  return (
    <Select
      value={repoId || undefined}
      onValueChange={(value) => {
        if (value) {
          setRepoId(value);
        }
      }}
    >
      <SelectTrigger
        className="bg-background w-36 sm:w-60"
        aria-label={t("selectRepo")}
      >
        <GitBranch className="text-muted-foreground size-3.5" />
        <SelectValue placeholder={t("selectRepo")}>
          {(value: string | null) =>
            repos.find((r) => r.id === value)?.fullName ?? t("selectRepo")
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {repos.map((repo) => (
          <SelectItem key={repo.id} value={repo.id}>
            {repo.fullName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Navigation() {
  const pathname = usePathname();
  const t = useTranslations("devFlow");
  const { setOpenMobile } = useSidebar();

  return NAV_GROUPS.map((group) => (
    <SidebarGroup key={group.items[0].href} className="px-3 py-2">
      {group.labelKey ? (
        <SidebarGroupLabel className="px-3 text-xs font-medium">
          {t(`nav.${group.labelKey}`)}
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {group.items.map((item) => {
            const active =
              item.href === "/dev-flow"
                ? pathname === "/dev-flow"
                : pathname.startsWith(item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={active}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    setOpenMobile(false);
                  }}
                  render={<Link href={item.href} />}
                  className="text-sidebar-foreground/80 data-active:bg-card data-active:text-primary h-9 px-3 data-active:font-semibold data-active:shadow-xs"
                >
                  <item.icon className="size-4" strokeWidth={1.75} />
                  <span>{t(`nav.${item.labelKey}`)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}

export default function DevFlowShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("devFlow");
  const tn = useTranslations("nav");
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="px-4 py-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                render={<Link href="/dev-flow" />}
                className="h-11 gap-3 px-0 hover:bg-transparent"
              >
                <div className="bg-primary text-primary-foreground flex aspect-square size-9 items-center justify-center rounded-xl">
                  <Snowflake className="size-4" strokeWidth={1.75} />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">{t("title")}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <Navigation />
        </SidebarContent>
        <SidebarFooter className="mx-3 mb-2 border-t px-0 pt-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/" />}>
                <BotMessageSquare />
                <span>{t("backToOncall")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/knowledge" />}>
                <BookOpen />
                <span>{tn("knowledge")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 flex-1">
        <header className="bg-card flex h-16 shrink-0 items-center gap-2 border-b px-4 sm:gap-3 sm:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <RepoPicker />
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
