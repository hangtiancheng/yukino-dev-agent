"use client";
import { ArrowUp, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Mode } from "@/hooks/use-chat";

interface ChatInputProps {
  isStreaming: boolean;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onSend: (text: string) => void;
  onUpload: (file: File) => void;
}

export default function ChatInput({
  isStreaming,
  mode,
  onModeChange,
  onSend,
  onUpload,
}: ChatInputProps) {
  const t = useTranslations("chat");
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const send = () => {
    const t = text.trim();
    if (!t || isStreaming) {
      return;
    }
    onSend(t);
    setText("");
  };

  return (
    <InputGroup className="bg-card shadow-soft border-border focus-within:border-primary/50 rounded-2xl p-2 transition-colors">
      <InputGroupTextarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        disabled={isStreaming}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        className="max-h-40 min-h-16 px-3 py-2 text-sm"
        rows={2}
      />
      <InputGroupAddon align="block-end" className="justify-between pt-1.5">
        <InputGroupButton
          size="icon-sm"
          variant="ghost"
          aria-label={t("uploadFile")}
          title={t("uploadFile")}
          disabled={isStreaming}
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip />
        </InputGroupButton>
        <div className="flex items-center gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[mode]}
            onValueChange={(v) => {
              const next = v.at(-1);
              if (next === "quick" || next === "stream") {
                onModeChange(next);
              }
            }}
            aria-label={t("chatMode")}
          >
            <ToggleGroupItem value="quick">{t("modeQuick")}</ToggleGroupItem>
            <ToggleGroupItem value="stream">{t("modeStream")}</ToggleGroupItem>
          </ToggleGroup>
          <InputGroupButton
            size="icon-sm"
            variant="default"
            onClick={send}
            disabled={isStreaming || !text.trim()}
            aria-label={t("send")}
            className="size-8 rounded-lg"
          >
            {isStreaming ? <Spinner /> : <ArrowUp />}
          </InputGroupButton>
        </div>
      </InputGroupAddon>
      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.markdown"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            onUpload(f);
          }
          e.target.value = "";
        }}
      />
    </InputGroup>
  );
}
