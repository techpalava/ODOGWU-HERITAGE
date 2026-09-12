import type { Batch } from "../types";

/** Creates the no-argument action used by every rendered homepage Join CTA. */
export const createJoinRenderedBatchAction = (
  batch: Batch | null | undefined,
  onJoinCommunityBatch: (batch: Batch) => void,
): (() => void) => () => {
  if (batch) onJoinCommunityBatch(batch);
};
