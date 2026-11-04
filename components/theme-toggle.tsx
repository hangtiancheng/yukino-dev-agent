"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_THEME, isTheme, THEME_VALUES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const THEME_ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("common.theme");

  // The stored theme is only readable on the client, so the first client render
  // must reproduce the server output (DEFAULT_THEME) or hydration mismatches.
  // useSyncExternalStore flips the snapshot after hydration without a setState
  // inside an effect.
  const mounted = React.useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const effectiveTheme = mounted ? theme : DEFAULT_THEME;
  const Icon = THEME_ICONS[effectiveTheme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("label")}
            title={t("label")}
            className={cn(
              "border-input dark:bg-input/30 dark:hover:bg-input/50 rounded-[min(var(--radius-md),10px)] bg-transparent",
              className,
            )}
          >
            <Icon className="text-muted-foreground size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={effectiveTheme}
          onValueChange={(value) => {
            if (isTheme(value)) {
              setTheme(value);
            }
          }}
        >
          {THEME_VALUES.map((value) => {
            const ItemIcon = THEME_ICONS[value];
            return (
              <DropdownMenuRadioItem key={value} value={value}>
                <ItemIcon className="text-muted-foreground size-4" />
                {t(value)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
