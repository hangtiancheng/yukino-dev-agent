/**
 * Theme plumbing shared between the root layout (a blocking inline script) and
 * the client-side `ThemeProvider`.
 *
 * The script runs before first paint so the resolved theme class is already on
 * `<html>` when React hydrates — otherwise every load flashes the wrong
 * palette. It is deliberately plain, dependency-free JS because it is
 * stringified into the document head.
 */

export const THEME_STORAGE_KEY = "yukino-theme";

/**
 * Per-surface storage keys from before the theme moved to the root layout.
 * They are migrated into `THEME_STORAGE_KEY` on first run.
 */
export const LEGACY_THEME_STORAGE_KEYS = ["dev-flow-theme"];

export const DEFAULT_THEME: Theme = "system";

export const THEME_VALUES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEME_VALUES)[number];
export type ResolvedTheme = "light" | "dark";

export function isTheme(value: unknown): value is Theme {
  return THEME_VALUES.some((theme) => theme === value);
}

export const THEME_SCRIPT = `(function () {
  var KEY = ${JSON.stringify(THEME_STORAGE_KEY)};
  var LEGACY = ${JSON.stringify(LEGACY_THEME_STORAGE_KEYS)};
  var VALID = ${JSON.stringify(THEME_VALUES)};
  function read(key) {
    try {
      var value = window.localStorage.getItem(key);
      return VALID.indexOf(value) > -1 ? value : null;
    } catch (error) {
      return null;
    }
  }
  var theme = read(KEY);
  if (!theme) {
    for (var i = 0; i < LEGACY.length; i++) {
      var legacy = read(LEGACY[i]);
      if (legacy) {
        theme = legacy;
        try {
          window.localStorage.setItem(KEY, legacy);
          window.localStorage.removeItem(LEGACY[i]);
        } catch (error) {}
        break;
      }
    }
  }
  if (!theme) {
    theme = ${JSON.stringify(DEFAULT_THEME)};
  }
  var resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  var root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
})();`;
