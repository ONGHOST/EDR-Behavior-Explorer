// ============================================================================
// Confidence Scoring
// Fuses four independent signal sources into one 0-100 confidence score:
//   - Signature hits   (known-bad patterns, deterministic)
//   - Temporal findings (sequence/beaconing, probabilistic 0-1 each)
//   - Anomaly findings  (statistical deviation from the entity's own baseline)
//   - Lineage risk      (is this entity's ancestry itself suspicious)
// Weights are tunable constants below — in production these would be backed
// by the same BehaviorChunks via a trained model; this rule-based fusion is
// the explainable baseline that model output would be blended with or
// validated against.
// ============================================================================

import type {
  AnomalyFinding,
  BehaviorChunk,
  Detection,
  SignatureHit,
  TemporalFinding,
} from "../types.js";

const WEIGHTS = {
  signatureScale: 1.0, // signature weights already sum to a 0-~70 range
  temporalScale: 40, // each temporal finding score (0-1) * this
  anomalyPerFinding: 8, // flat points per anomalous feature, capped below
  anomalyCap: 32,
  lineageRiskScale: 15,
};

const SEVERITY_THRESHOLDS: Array<[number, Detection["severity"]]> = [
  [85, "critical"],
  [60, "high"],
  [35, "medium"],
  [0, "low"],
];

function severityFor(confidence: number): Detection["severity"] {
  for (const [threshold, severity] of SEVERITY_THRESHOLDS) {
    if (confidence >= threshold) return severity;
  }
  return "low";
}

/** Crude lineage risk: depth of shell/LOLBin nesting beneath a non-shell root. */
function lineageRisk(lineage: string[]): number {
  const shellLike = new Set([
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
    "wscript.exe",
    "cscript.exe",
    "mshta.exe",
    "rundll32.exe",
  ]);
  let depth = 0;
  for (const proc of lineage) if (shellLike.has(proc.toLowerCase())) depth++;
  if (depth <= 1) return 0;
  return Math.min(1, (depth - 1) / 3); // 2 nested shells = 0.33, 4+ = capped at 1
}

export interface ScoringInput {
  chunk: BehaviorChunk;
  lineage: string[];
  signatureHits: SignatureHit[];
  temporalFindings: TemporalFinding[];
  anomalyFindings: AnomalyFinding[];
}

export function computeConfidence(input: ScoringInput): { confidence: number; severity: Detection["severity"] } {
  const signatureScore =
    input.signatureHits.reduce((sum, h) => sum + h.weight, 0) * WEIGHTS.signatureScale;

  const temporalScore =
    input.temporalFindings.reduce((sum, f) => sum + f.score, 0) * WEIGHTS.temporalScale;

  const anomalyScore = Math.min(
    WEIGHTS.anomalyCap,
    input.anomalyFindings.length * WEIGHTS.anomalyPerFinding,
  );

  const lineageScore = lineageRisk(input.lineage) * WEIGHTS.lineageRiskScale;

  const raw = signatureScore + temporalScore + anomalyScore + lineageScore;
  const confidence = Math.round(Math.max(0, Math.min(100, raw)));

  return { confidence, severity: severityFor(confidence) };
}
