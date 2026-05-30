import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { Snapshot } from "./snapshot";

export const STASH_STATE_ENTRY_TYPE = "stash-state";

// Session entries are append-only, so the last stash-state entry on the
// current branch is the active snapshot for this runtime.
export function readLatestSnapshotFromBranch(
  ctx: ExtensionContext,
): Snapshot | null {
  let latest: Snapshot | null = null;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (
      entry.type !== "custom" ||
      entry.customType !== STASH_STATE_ENTRY_TYPE
    ) {
      continue;
    }

    latest = Snapshot.fromData(entry.data);
  }

  return latest;
}
