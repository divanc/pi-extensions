/**
 * Sync Pi theme with macOS system appearance, plus manual hotkey theme rotation.
 *
 * Hotkeys:
 * - F6: rotate through all discovered Pi themes
 * - Ctrl+Shift+T: same rotation, if your terminal sends it to Pi
 *
 * Commands:
 * - /theme-toggle        rotate through all themes
 * - /theme-toggle list   show available themes
 * - /theme-toggle auto   resume macOS system-theme sync
 * - /theme-toggle dark   force configured dark theme
 * - /theme-toggle light  force configured light theme
 * - /theme-toggle <name> switch to a specific theme
 *
 * Env overrides:
 * - PI_THEME_TOGGLE_DARK=dark-contrast
 * - PI_THEME_TOGGLE_LIGHT=light
 * - PI_THEME_TOGGLE_THEMES=dark,light,dark-contrast  # optional custom cycle order
 * - PI_THEME_TOGGLE_AUTO_SYNC=0  # disable macOS polling
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const execAsync = promisify(exec);
const DARK_THEME = process.env.PI_THEME_TOGGLE_DARK || "dark-contrast";
const LIGHT_THEME = process.env.PI_THEME_TOGGLE_LIGHT || "light";
const AUTO_SYNC = process.env.PI_THEME_TOGGLE_AUTO_SYNC !== "0";
const THEME_CYCLE = process.env.PI_THEME_TOGGLE_THEMES?.split(",")
  .map((theme) => theme.trim())
  .filter(Boolean);
const POLL_MS = 2000;

async function isDarkMode(): Promise<boolean> {
  if (process.platform !== "darwin") return true;

  try {
    const { stdout } = await execAsync(
      "osascript -e 'tell application \"System Events\" to tell appearance preferences to return dark mode'",
    );
    return stdout.trim() === "true";
  } catch {
    return true;
  }
}

export default function systemTheme(pi: ExtensionAPI) {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let currentTheme: string | null = null;
  let manualOverride = false;

  function updateStatus(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    const mode = manualOverride ? "manual" : AUTO_SYNC ? "auto" : "manual";
    const theme = currentTheme ?? ctx.ui.theme.name ?? "unknown";
    ctx.ui.setStatus("theme-toggle", ctx.ui.theme.fg("dim", `theme:${theme}:${mode}`));
  }

  function setTheme(ctx: ExtensionContext, nextTheme: string, notify = false): boolean {
    if (!ctx.hasUI) return false;

    const result = ctx.ui.setTheme(nextTheme);
    if (!result.success) {
      ctx.ui.notify(`Could not switch to theme "${nextTheme}": ${result.error ?? "unknown error"}`, "error");
      return false;
    }

    currentTheme = nextTheme;
    updateStatus(ctx);
    if (notify) ctx.ui.notify(`Theme: ${nextTheme}`, "info");
    return true;
  }

  async function syncTheme(ctx: ExtensionContext) {
    if (!AUTO_SYNC || manualOverride || !ctx.hasUI) return;

    const nextTheme = (await isDarkMode()) ? DARK_THEME : LIGHT_THEME;
    if (nextTheme !== currentTheme) setTheme(ctx, nextTheme);
  }

  function getCycleThemes(ctx: ExtensionContext): string[] {
    if (!ctx.hasUI) return [];

    const available = ctx.ui.getAllThemes().map((theme) => theme.name);
    const cycle = THEME_CYCLE?.length
      ? THEME_CYCLE.filter((theme) => available.includes(theme))
      : available;

    return [...new Set(cycle)];
  }

  function rotateTheme(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;

    const themes = getCycleThemes(ctx);
    if (themes.length === 0) {
      ctx.ui.notify("No themes available", "warning");
      return;
    }

    const activeTheme = currentTheme ?? ctx.ui.theme.name;
    const activeIndex = activeTheme ? themes.indexOf(activeTheme) : -1;
    const nextTheme = themes[(activeIndex + 1) % themes.length];

    manualOverride = true;
    setTheme(ctx, nextTheme, true);
  }

  async function resumeAutoSync(ctx: ExtensionContext) {
    manualOverride = false;
    await syncTheme(ctx);
    updateStatus(ctx);
    if (ctx.hasUI) ctx.ui.notify("Theme auto-sync resumed", "info");
  }

  pi.registerShortcut("f6", {
    description: "Rotate Pi theme",
    handler: rotateTheme,
  });

  pi.registerShortcut("ctrl+shift+t", {
    description: "Rotate Pi theme",
    handler: rotateTheme,
  });

  pi.registerCommand("theme-toggle", {
    description: "Rotate Pi theme, or use: list | auto | dark | light | <name>",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();

      if (action === "auto") {
        await resumeAutoSync(ctx);
        return;
      }

      if (action === "list") {
        const themes = ctx.ui.getAllThemes().map((theme) => theme.name);
        ctx.ui.notify(`Themes: ${themes.join(", ")}`, "info");
        return;
      }

      if (action === "dark") {
        manualOverride = true;
        setTheme(ctx, DARK_THEME, true);
        return;
      }

      if (action === "light") {
        manualOverride = true;
        setTheme(ctx, LIGHT_THEME, true);
        return;
      }

      if (action.length > 0) {
        const matchingTheme = ctx.ui.getAllThemes().find((theme) => theme.name.toLowerCase() === action);
        if (!matchingTheme) {
          ctx.ui.notify("Usage: /theme-toggle [list|auto|dark|light|<name>]", "warning");
          return;
        }

        manualOverride = true;
        setTheme(ctx, matchingTheme.name, true);
        return;
      }

      rotateTheme(ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    currentTheme = ctx.ui.theme.name ?? currentTheme;
    await syncTheme(ctx);
    updateStatus(ctx);

    if (AUTO_SYNC) {
      intervalId = setInterval(() => {
        void syncTheme(ctx);
      }, POLL_MS);
    }
  });

  pi.on("session_shutdown", () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  });
}
