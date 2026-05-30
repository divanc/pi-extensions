import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
  readLatestSnapshotFromBranch,
  STASH_STATE_ENTRY_TYPE,
} from "./session-store";

import { STASH_HOTKEY } from "./hotkey";
import { Snapshot, type SnapshotData } from "./snapshot";

const STATUS_KEY = "stash";

type RestoreReason = "shortcut" | "submit";

export class StashExtension {
  private state: Snapshot | null = null;
  private pendingSubmitRestore: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly pi: ExtensionAPI) {}

  // Public extension operations used by the Pi adapter.
  hydrate(ctx: ExtensionContext): void {
    this.state = readLatestSnapshotFromBranch(ctx);
    this.updateStatus(ctx);
  }

  toggle(ctx: ExtensionContext): void {
    if (this.state) return this.restoreToEditor(ctx, "shortcut");

    return this.stashEditorText(ctx);
  }

  restoreAfterSubmit(ctx: ExtensionContext): void {
    if (!this.state) return;

    this.clearPendingSubmitRestore();
    // Pi does not expose a hook for "submitted prompt has cleared from the
    // editor", so defer one tick to restore the stash after submit handling.
    this.pendingSubmitRestore = setTimeout(() => {
      this.pendingSubmitRestore = undefined;
      this.restoreToEditor(ctx, "submit");
    }, 0);
  }

  dispose(): void {
    this.clearPendingSubmitRestore();
  }

  // Private implementation details: UI orchestration, persistence, and timer cleanup.
  private stashEditorText(ctx: ExtensionContext): void {
    const current = ctx.ui.getEditorText();
    if (!current.trim()) {
      ctx.ui.notify("Nothing to stash.", "info");
      return;
    }

    this.replaceState(Snapshot.stash(current));
    this.updateStatus(ctx);
    ctx.ui.setEditorText("");
    ctx.ui.notify(
      `Message stashed. Press ${STASH_HOTKEY.label} again to restore.`,
      "info",
    );
  }

  private restoreToEditor(ctx: ExtensionContext, reason: RestoreReason): void {
    const text = this.state?.text;
    if (!text) return;

    this.replaceState(null);
    this.updateStatus(ctx);
    ctx.ui.setEditorText(text);

    if (reason === "shortcut") {
      ctx.ui.notify("Stash restored to editor.", "info");
    }
  }

  private replaceState(next: Snapshot | null): void {
    this.state = next;
    this.pi.appendEntry<SnapshotData | null>(
      STASH_STATE_ENTRY_TYPE,
      this.state?.toData() ?? null,
    );
  }

  private updateStatus(ctx: ExtensionContext): void {
    ctx.ui.setStatus(
      STATUS_KEY,
      this.state ? ctx.ui.theme.fg("accent", "stash") : undefined,
    );
  }

  private clearPendingSubmitRestore(): void {
    if (!this.pendingSubmitRestore) return;
    clearTimeout(this.pendingSubmitRestore);
    this.pendingSubmitRestore = undefined;
  }
}
