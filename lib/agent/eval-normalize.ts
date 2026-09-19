import type { EvaluationScores, FailureType } from "@/lib/agent/types";

const EMPTY: EvaluationScores = {
  similarity: 0,
  promptAdherence: 0,
  visualQuality: 0,
  partIdentity: 0,
  safetyCoverage: 0,
  inventedParts: false,
  warningPresent: true,
  sequenceCorrect: true,
  temporalConsistency: 0,
  passed: false,
  critique: "",
  failureType: "visual",
  narrationAlignment: 1,
  motionCoherence: 0,
  cheapGate: 0,
};

export function emptyEvaluation(critique = ""): EvaluationScores {
  return { ...EMPTY, critique };
}

export function normalizeEvaluation(scores: Partial<EvaluationScores>): EvaluationScores {
  const merged: EvaluationScores = { ...EMPTY, ...scores };
  const cheapGate = merged.cheapGate ?? merged.similarity;
  const invented = Boolean(merged.inventedParts);
  const warningPresent = merged.warningPresent !== false;
  const visualFail =
    invented ||
    !warningPresent ||
    cheapGate < 0.2 ||
    (merged.partIdentity ?? 0) < 0.55 ||
    (merged.similarity ?? 0) < 0.55;
  const audioFail = (merged.narrationAlignment ?? 1) < 0.55;

  let failureType: FailureType = "none";
  if (visualFail) failureType = "visual";
  else if (audioFail) failureType = "audio";

  return {
    ...merged,
    cheapGate,
    inventedParts: invented,
    warningPresent,
    failureType,
    passed: failureType === "none",
    critique:
      merged.critique ||
      (failureType === "none"
        ? "Looks good"
        : failureType === "audio"
          ? "Spoken audio does not match the planned narration."
          : "Still misses the brief or invents hardware."),
  };
}
