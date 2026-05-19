import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSetupCommand } from "./setup";
import { createWebFetchTool } from "./tools/web-fetch";
import { createWebSearchTool } from "./tools/web-search";

export default function (pi: ExtensionAPI) {
  pi.registerTool(createWebSearchTool());
  pi.registerTool(createWebFetchTool());
  registerSetupCommand(pi);
}
