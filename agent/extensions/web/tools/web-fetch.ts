import { Type } from "typebox";
import { cacheKey, withCache } from "../cache";
import { stringEnum } from "../schema";
import { TAVILY_EXTRACT_URL, tavilyPost, type TavilyExtractResponse } from "../tavily";

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice("http://".length)}`;
  return trimmed;
}

function formatFetchResult(data: TavilyExtractResponse, url: string, prompt: string): string {
  const result = data.results?.[0];
  const failed = data.failed_results?.[0];

  if (!result?.raw_content) {
    const reason = failed?.error ? `: ${failed.error}` : "";
    throw new Error(`Tavily could not extract content from ${url}${reason}`);
  }

  return [
    `Processed web fetch`,
    `URL: ${result.url ?? url}`,
    `Prompt: ${prompt}`,
    "",
    result.raw_content.trim(),
  ].join("\n");
}

export function createWebFetchTool() {
  return {
    name: "web_fetch",
    label: "Web Fetch",
    description: "Fetch one URL through Tavily Extract using a required prompt. Auto-upgrades http:// URLs to https://. Returns Tavily-processed relevant content, not raw page HTML, and does not browse, click links, crawl, use cookies, or run JavaScript.",
    promptSnippet: "Fetch and process one URL with a focused extraction prompt",
    promptGuidelines: [
      "Use web_fetch only with a specific URL and a focused prompt describing what to extract or summarize.",
      "web_fetch does not navigate websites; call web_search or another web_fetch if further research is needed.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch. http:// is automatically upgraded to https://." }),
      prompt: Type.String({ description: "Required extraction prompt / user intent for the page content." }),
      depth: Type.Optional(stringEnum(["basic", "advanced"] as const, { description: "Extraction depth. Defaults to basic; advanced costs more Tavily credits." })),
    }),
    async execute(_toolCallId: string, params: { url: string; prompt: string; depth?: string }, signal?: AbortSignal) {
      if (!params.prompt.trim()) throw new Error("web_fetch requires a non-empty prompt.");
      const url = normalizeUrl(params.url);
      const body = {
        urls: url,
        query: params.prompt,
        chunks_per_source: 5,
        extract_depth: params.depth ?? "basic",
        include_images: false,
      };

      const data = await withCache<TavilyExtractResponse>(cacheKey("web_fetch", body), () =>
        tavilyPost<TavilyExtractResponse>(TAVILY_EXTRACT_URL, body, signal),
      );

      return {
        content: [{ type: "text" as const, text: formatFetchResult(data, url, params.prompt) }],
        details: { provider: "tavily", url, prompt: params.prompt, result: data.results?.[0], failedResults: data.failed_results ?? [], requestId: data.request_id },
      };
    },
  };
}
