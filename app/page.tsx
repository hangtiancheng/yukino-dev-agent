"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

import ActiveAlertsPanel, {
  type AiOpsReportPayload,
} from "@/components/active-alerts-panel";
import AIOpsBtn from "@/components/ai-ops-btn";
import ChatContainer from "@/components/chat-container";
import { LanguageSwitcher } from "@/components/language-switcher";
import LoadingOverlay from "@/components/loading-overlay";
import { OncallSettings } from "@/components/oncall-settings";
import Sidebar from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useChat } from "@/hooks/use-chat";

export default function Home() {
  const t = useTranslations("chat");
  const {
    isStreaming,
    messages,
    sessionId,
    mode,
    setMode,
    histories,
    overlay,
    showNotification,
    newChat,
    loadChatHistory,
    deleteChatHistory,
    sendMessage,
    sendA2uiAction,
    triggerAIOps,
    uploadFile,
    addMessage,
  } = useChat();

  const handleAIOps = useCallback(async () => {
    if (isStreaming) {
      showNotification(t("notifications.waitForOperation"), "warning");
      return;
    }
    await triggerAIOps();
  }, [isStreaming, showNotification, triggerAIOps, t]);

  const handleUpload = useCallback(
    async (file: File) => {
      const msg = await uploadFile(file);
      if (msg) {
        addMessage({ type: "assistant", content: msg });
      }
    },
    [uploadFile, addMessage],
  );

  const handlePanelReport = useCallback(
    (r: AiOpsReportPayload) => {
      addMessage({
        type: "assistant",
        content: r.result,
        detail: r.detail,
        ...(r.a2ui && r.a2ui.length > 0 ? { a2ui: r.a2ui } : {}),
      });
    },
    [addMessage],
  );

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar
        histories={histories}
        activeId={sessionId}
        onNewChat={newChat}
        onLoad={loadChatHistory}
        onDelete={deleteChatHistory}
      />
      <SidebarInset className="h-svh min-w-0 flex-1 overflow-hidden">
        <header className="bg-card flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
          <SidebarTrigger />
          <span className="text-muted-foreground text-sm">OnCall</span>
          <div className="ml-auto flex items-center gap-1.5">
            <AIOpsBtn
              onClick={() => {
                void handleAIOps();
              }}
              disabled={isStreaming}
            />
            <OncallSettings />
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatContainer
            messages={messages}
            isStreaming={isStreaming}
            sessionId={sessionId}
            mode={mode}
            onModeChange={setMode}
            onSend={(text) => {
              void sendMessage(text);
            }}
            onA2uiAction={(messageIndex, action) => {
              void sendA2uiAction(messageIndex, action);
            }}
            onUpload={(file) => {
              void handleUpload(file);
            }}
          />
          <ActiveAlertsPanel
            disabled={isStreaming}
            onReport={handlePanelReport}
            onNotify={showNotification}
          />
        </div>
      </SidebarInset>
      <LoadingOverlay overlay={overlay} />
    </SidebarProvider>
  );
}
