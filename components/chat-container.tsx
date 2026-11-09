"use client";

import type { A2uiClientAction } from "@a2ui/web_core/v0_9";
import { BookSearch, LifeBuoy, Search, Snowflake } from "lucide-react";
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
      className={`relative flex min-h-0 flex-1 flex-col ${centered ? "justify-center overflow-y-auto" : "overflow-hidden"}`}
    >
      {centered ? (
        <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-7 sm:px-6">
          <Snowflake className="text-primary mb-6 size-9" strokeWidth={1.4} />
          <h1 className="text-foreground text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            {t("greeting")}
          </h1>
        </div>
      ) : (
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          sessionId={sessionId}
          onA2uiAction={onA2uiAction}
        />
      )}
      <div className="w-full shrink-0 px-4 pb-5 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <ChatInput
            isStreaming={isStreaming}
            mode={mode}
            onModeChange={onModeChange}
            onSend={onSend}
            onUpload={onUpload}
          />
          {centered ? (
            <div className="mt-4 grid gap-2 pb-12 sm:grid-cols-3">
              {SUGGESTION_KEYS.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  disabled={isStreaming}
                  onClick={() => {
                    onSend(t(key));
                  }}
                  className="border-border text-muted-foreground hover:border-primary/40 hover:bg-card hover:text-foreground focus-visible:ring-ring flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-3 text-left text-xs leading-relaxed transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Icon
                    className="text-primary mt-0.5 size-4 shrink-0"
                    strokeWidth={1.75}
                  />
                  <span>{t(key)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
