import { Type } from "typebox";
import { cacheKey, withCache } from "../cache";
import { stringEnum } from "../schema";
import { TAVILY_SEARCH_URL, tavilyPost, type TavilySearchResponse } from "../tavily";

function clampMaxResults(value: number | undefined): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(10, Math.floor(value ?? 5)));
}

function formatSearchResults(data: TavilySearchResponse, maxResults: number): string {
  const results = (data.results ?? []).slice(0, maxResults);
  if (results.length === 0) return "No web results found.";

  const lines = results.map((result, index) => {
    const title = result.title || "Untitled";
    const url = result.url || "";
    const snippet = result.content ? `\n   ${result.content.replace(/\s+/g, " ").trim()}` : "";
    const score = typeof result.score === "number" ? ` score=${result.score.toFixed(3)}` : "";
    const date = result.published_date ? ` published=${result.published_date}` : "";
    return `${index + 1}. ${title}\n   ${url}${score}${date}${snippet}`;
  });

  return `Web search results for: ${data.query ?? "query"}\n\n${lines.join("\n\n")}`;
}

export function createWebSearchTool() {
  return {
    name: "web_search",
    label: "Web Search",
    description: "Search the web with Tavily. Returns compact ranked results only: title, URL, snippet, score, and published date when available. Does not fetch full page content.",
    promptSnippet: "Search the web for current or external information using Tavily",
    promptGuidelines: [
      "Use web_search when the user asks for current, recent, external, or web-sourced information that is not available in the local files.",
      "Use web_fetch after web_search when you need to inspect a specific result URL with a focused prompt.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query." }),
      max_results: Type.Optional(Type.Integer({ description: "Number of results to return. Defaults to 5, capped at 10.", minimum: 1, maximum: 10 })),
      time_range: Type.Optional(stringEnum(["day", "week", "month", "year"] as const, { description: "Optional freshness filter." })),
      depth: Type.Optional(stringEnum(["basic", "advanced"] as const, { description: "Search depth. Defaults to basic; advanced costs more Tavily credits." })),
    }),
    async execute(_toolCallId: string, params: { query: string; max_results?: number; time_range?: string; depth?: string }, signal?: AbortSignal) {
      const maxResults = clampMaxResults(params.max_results);
      const body: Record<string, unknown> = {
        query: params.query,
        max_results: maxResults,
        search_depth: params.depth ?? "basic",
        include_answer: false,
        include_raw_content: false,
      };
      if (params.time_range) body.time_range = params.time_range;

      const data = await withCache<TavilySearchResponse>(cacheKey("web_search", body), () =>
        tavilyPost<TavilySearchResponse>(TAVILY_SEARCH_URL, body, signal),
      );

      return {
        content: [{ type: "text" as const, text: formatSearchResults(data, maxResults) }],
        details: { provider: "tavily", query: params.query, maxResults, results: data.results ?? [], requestId: data.request_id },
      };
    },
  };
}
