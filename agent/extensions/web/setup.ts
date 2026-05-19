import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { clearCache } from "./cache";
import { readSettings, writeSettings } from "./settings";
import { validateApiKey } from "./tavily";

export function registerSetupCommand(pi: ExtensionAPI): void {
  const command = {
    description: "Configure Tavily API key for web_search/web_fetch",
    handler: async (_args, ctx) => {
      const key = (await ctx.ui.input("Tavily API key", "tvly-..."))?.trim();
      if (!key) {
        ctx.ui.notify("No Tavily API key entered.", "warning");
        return;
      }

      try {
        await validateApiKey(key, ctx.signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Tavily API key was not saved: ${message}`, "error");
        return;
      }

      const settings = await readSettings();
      settings.webSearch = {
        ...(settings.webSearch ?? {}),
        provider: "tavily",
        tavilyApiKey: key,
      };
      await writeSettings(settings);
      clearCache();
      ctx.ui.notify("Saved Tavily API key to ~/.pi/agent/settings.json (webSearch.tavilyApiKey).", "info");
    },
  };

  pi.registerCommand("web-setup", command);
  pi.registerCommand("web-search-setup", command);
}
