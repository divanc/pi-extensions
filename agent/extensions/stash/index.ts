import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { StashExtension } from "./extension";
import { STASH_HOTKEY } from "./hotkey";

export default function stashExtension(pi: ExtensionAPI): void {
  const stash = new StashExtension(pi);

  pi.on("session_start", async (_event, ctx) => {
    stash.hydrate(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    stash.hydrate(ctx);
  });

  pi.registerShortcut(STASH_HOTKEY.binding, {
    description: "Stash or restore the current unsent editor message",
    handler: async (ctx) => stash.toggle(ctx),
  });

  pi.registerCommand("stash", {
    description: "Stash/restore current unsent editor message",
    handler: async (_args, ctx) => stash.toggle(ctx),
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    stash.restoreAfterSubmit(ctx);
  });

  pi.on("session_shutdown", async () => {
    stash.dispose();
  });
}
