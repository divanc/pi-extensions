import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export const SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

export interface WebSearchSettings {
  webSearch?: {
    provider?: string;
    tavilyApiKey?: string;
  };
  [key: string]: unknown;
}

export async function readSettings(): Promise<WebSearchSettings> {
  try {
    const text = await readFile(SETTINGS_PATH, "utf8");
    return JSON.parse(text) as WebSearchSettings;
  } catch {
    return {};
  }
}

export async function writeSettings(settings: WebSearchSettings): Promise<void> {
  await writeFile(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export async function getApiKey(): Promise<string | undefined> {
  const envKey = process.env.TAVILY_API_KEY?.trim();
  if (envKey) return envKey;

  const settings = await readSettings();
  const settingsKey = settings.webSearch?.tavilyApiKey?.trim();
  return settingsKey || undefined;
}

export function requireApiKeyMessage(): string {
  return "Missing Tavily API key. Set TAVILY_API_KEY or run /web-search-setup to save it in ~/.pi/agent/settings.json under webSearch.tavilyApiKey.";
}
