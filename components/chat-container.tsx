"use client";
import type { A2uiClientAction } from "@a2ui/web_core/v0_9";
import { BookSearch, LifeBuoy, Search, Snowflake } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import type { ChatMessage, Mode } from "@/hooks/use-chat";

import ChatInput from "./chat-input";
import MessageList from "./msg-list";

const SUGGESTION_KEYS = [
  { key: "suggestionOncall", icon: LifeBuoy },
  { key: "suggestionRunbook", icon: BookSearch },
  { key: "suggestionIncident", icon: Search },
] as const;

interface ChatContainerProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  sessionId: string;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onSend: (text: string) => void;
  onA2uiAction: (messageIndex: number, action: A2uiClientAction) => void;
  onUpload: (file: File) => void;
}

export default function ChatContainer({
  messages,
  isStreaming,
  sessionId,
  mode,
  onModeChange,
  onSend,
  onA2uiAction,
  onUpload,
}: ChatContainerProps) {
  const t = useTranslations("chat");
  const centered = messages.length === 0;
  return (
    <div
      className={`relative flex flex-1 flex-col overflow-hidden ${
        centered ? "items-center justify-center" : ""
      }`}
    >
      {centered ? (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            y: { type: "spring", visualDuration: 0.55, bounce: 0.18 },
            opacity: { duration: 0.35, ease: "easeOut" },
          }}
          className="flex w-full max-w-xl flex-col items-center px-6 pb-6 text-center"
        >
          <div className="relative flex items-center justify-center">
            <span className="bg-primary/20 absolute -inset-5 rounded-full blur-2xl" />
            <span className="from-primary to-chart-2 text-primary-foreground shadow-lift ring-primary/25 relative flex size-16 items-center justify-center rounded-[1.4rem] bg-linear-to-br ring-1">
              <Snowflake className="size-8" strokeWidth={1.5} />
            </span>
          </div>
          <h1 className="text-foreground mt-7 text-[1.7rem] leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
            {t("greeting")}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-md text-sm leading-relaxed text-pretty">
            {t("heroSubtitle")}
          </p>
          <div className="mt-8 flex w-full flex-col gap-2">
            {SUGGESTION_KEYS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSend(t(key));
                }}
                className="group border-border/70 bg-card/70 hover:border-primary/40 hover:bg-card shadow-soft hover:shadow-lift flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5"
              >
                <span className="bg-primary/10 text-primary ring-primary/15 group-hover:bg-primary/15 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors">
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="text-foreground/85 min-w-0 flex-1 text-[13px] leading-snug">
                  {t(key)}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      ) : (
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          sessionId={sessionId}
          onA2uiAction={onA2uiAction}
        />
      )}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          y: { type: "spring", visualDuration: 0.5, bounce: 0.15 },
          opacity: { duration: 0.3, ease: "easeOut" },
        }}
        className="w-full px-4 pb-5 sm:px-6"
      >
        <div className="mx-auto w-full max-w-3xl">
          <ChatInput
            isStreaming={isStreaming}
            mode={mode}
            onModeChange={onModeChange}
            onSend={onSend}
            onUpload={onUpload}
          />
        </div>
      </motion.div>
    </div>
  );
}
