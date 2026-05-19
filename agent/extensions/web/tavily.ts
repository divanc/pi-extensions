import { getApiKey, requireApiKeyMessage } from "./settings";

export const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
export const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";

export interface TavilySearchResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

export interface TavilySearchResponse {
  query?: string;
  results?: TavilySearchResult[];
  response_time?: number;
  request_id?: string;
}

export interface TavilyExtractResult {
  url?: string;
  raw_content?: string;
  images?: string[];
  favicon?: string;
}

export interface TavilyExtractResponse {
  results?: TavilyExtractResult[];
  failed_results?: Array<{ url?: string; error?: string }>;
  response_time?: number;
  request_id?: string;
}

export async function tavilyPost<T>(url: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error(requireApiKeyMessage());

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    const detail = typeof json === "object" && json && "detail" in json ? JSON.stringify((json as { detail: unknown }).detail) : text;
    throw new Error(`Tavily request failed (${response.status}): ${detail || response.statusText}`);
  }

  return json as T;
}

export async function validateApiKey(apiKey: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: "test", max_results: 1, search_depth: "basic" }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Tavily validation failed (${response.status}): ${text || response.statusText}`);
  }
}
