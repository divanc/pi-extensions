/**
 * Sync Pi theme with macOS system appearance.
 * Dark mode uses our higher-contrast custom dark theme.
 * Light mode uses Pi's built-in light theme.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const execAsync = promisify(exec);
const DARK_THEME = "dark-contrast";
const LIGHT_THEME = "light";
const POLL_MS = 2000;

async function isDarkMode(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      "osascript -e 'tell application \"System Events\" to tell appearance preferences to return dark mode'",
    );
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export default function (pi: ExtensionAPI) {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let currentTheme: string | null = null;

  async function syncTheme(ctx: { ui: { setTheme(theme: string): void } }) {
    const nextTheme = (await isDarkMode()) ? DARK_THEME : LIGHT_THEME;
    if (nextTheme !== currentTheme) {
      currentTheme = nextTheme;
      ctx.ui.setTheme(nextTheme);
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    await syncTheme(ctx);

    intervalId = setInterval(() => {
      void syncTheme(ctx);
    }, POLL_MS);
  });

  pi.on("session_shutdown", () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  });
}
