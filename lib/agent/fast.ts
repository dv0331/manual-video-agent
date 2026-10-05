/** On unless FAST_CUT=0. Skips model calls that blow a one-minute budget. */
export function fastCut() {
  return process.env.FAST_CUT !== "0";
}

export const FAST_CLIP_SECONDS = 4;
