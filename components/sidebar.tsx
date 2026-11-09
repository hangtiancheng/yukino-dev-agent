"use client";
import {
  BookOpen,
  BotMessageSquare,
  FolderGit2,
  MessageSquare,
  Plus,
  Snowflake,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ChatHistory } from "@/hooks/use-chat";

interface SidebarProps {
  histories: ChatHistory[];
  activeId: string;
  onNewChat: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

const WORKSPACE_LINKS = [
  { href: "/", labelKey: "oncall", icon: BotMessageSquare, active: true },
  { href: "/dev-flow", labelKey: "devFlow", icon: FolderGit2, active: false },
  { href: "/knowledge", labelKey: "knowledge", icon: BookOpen, active: false },
] as const;

export default function Sidebar({
  histories,
  activeId,
  onNewChat,
  onLoad,
  onDelete,
}: SidebarProps) {
  const t = useTranslations("chat");
  const tn = useTranslations("nav");
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarPrimitive collapsible="offcanvas">
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-3">
          <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Snowflake className="size-[18px]" strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-foreground truncate text-sm font-semibold tracking-tight">
              {t("appName")}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="px-3 py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    onNewChat();
                    setOpenMobile(false);
                  }}
                  className="bg-card border-border text-foreground hover:bg-accent h-10 rounded-lg border font-medium"
                >
                  <Plus />
                  <span>{t("newChat")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="min-h-0 flex-1 px-3 py-3">
          {histories.length > 0 ? (
            <SidebarGroupLabel className="text-muted-foreground px-3 text-xs">
              {t("recent")}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <AnimatePresence initial={false}>
                {histories.map((h) => (
                  <motion.li
                    key={h.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{
                      height: { duration: 0.25, ease: [0.23, 1, 0.32, 1] },
                      opacity: { duration: 0.2, ease: "easeOut" },
                    }}
                    className="group/menu-item relative overflow-hidden"
                  >
                    <SidebarMenuButton
                      isActive={h.id === activeId}
                      onClick={() => {
                        onLoad(h.id);
                        setOpenMobile(false);
                      }}
                      tooltip={h.title}
                      className="data-active:bg-primary/12 data-active:text-primary rounded-lg data-active:font-medium"
                    >
                      <MessageSquare />
                      <span>{h.title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      onClick={() => {
                        onDelete(h.id);
                      }}
                      aria-label={t("delete")}
                      className="hover:text-destructive"
                    >
                      <Trash2 />
                    </SidebarMenuAction>
                  </motion.li>
                ))}
              </AnimatePresence>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto px-3 py-3">
          <SidebarGroupContent>
            <SidebarSeparator className="mb-2" />
            <SidebarMenu className="gap-0.5">
              {WORKSPACE_LINKS.map((link) => (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton
                    isActive={link.active}
                    aria-current={link.active ? "page" : undefined}
                    onClick={() => {
                      setOpenMobile(false);
                    }}
                    render={<Link href={link.href} />}
                    className="data-active:bg-primary/12 data-active:text-primary rounded-lg data-active:font-medium"
                  >
                    <link.icon />
                    <span>{tn(link.labelKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </SidebarPrimitive>
  );
}
