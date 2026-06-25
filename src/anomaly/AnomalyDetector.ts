// ============================================================================
// Anomaly Detection
// Maintains a streaming statistical baseline (mean/std via Welford's online
// algorithm — no need to store full history) per *process name*, since
// "normal" for powershell.exe and "normal" for notepad.exe are very
// different populations. Each new chunk's features are scored against that
// process's own baseline; large deviations are flagged.
// ============================================================================

import type { AnomalyFinding, BehaviorChunk, ChunkFeatures } from "../types.js";

const SCORED_FEATURES: (keyof ChunkFeatures)[] = [
  "eventCount",
  "networkConnectCount",
  "fileWriteCount",
  "fileDeleteCount",
  "uniqueNetworkDestinations",
  "uniqueFilesTouched",
  "childProcessCount",
  "avgCpuPercent",
  "maxWorkingSetMb",
];

// Resource features only mean something when the chunk actually contains
// resource_sample events — a window with zero samples isn't "0% CPU", it's
// "no reading", and folding that fake zero into the baseline would corrupt
// it for hosts where the collector samples sparsely or not at all.
const RESOURCE_FEATURES = new Set<keyof ChunkFeatures>(["avgCpuPercent", "maxCpuPercent", "avgWorkingSetMb", "maxWorkingSetMb", "maxPrivateBytesMb"]);

const Z_SCORE_THRESHOLD = 3.0;
const MIN_SAMPLES_BEFORE_SCORING = 8; // don't flag anomalies until baseline is meaningful

interface RunningStat {
  n: number;
  mean: number;
  m2: number; // sum of squared deviations, for Welford's algorithm
}

function emptyStat(): RunningStat {
  return { n: 0, mean: 0, m2: 0 };
}

function update(stat: RunningStat, value: number): RunningStat {
  const n = stat.n + 1;
  const delta = value - stat.mean;
  const mean = stat.mean + delta / n;
  const delta2 = value - mean;
  const m2 = stat.m2 + delta * delta2;
  return { n, mean, m2 };
}

function stdOf(stat: RunningStat): number {
  if (stat.n < 2) return 0;
  return Math.sqrt(stat.m2 / (stat.n - 1));
}

export class AnomalyDetector {
  // processName -> feature -> running stat
  private readonly baselines = new Map<string, Map<keyof ChunkFeatures, RunningStat>>();

  /**
   * Score a chunk against its process's baseline, THEN fold the chunk into
   * the baseline (so the baseline adapts over time — classic online learning).
   * Order matters: we score before updating so a chunk is never compared
   * against a baseline that already includes itself.
   */
  score(chunk: BehaviorChunk): AnomalyFinding[] {
    const processName = chunk.events[0]?.processName ?? "unknown";
    const stats = this.baselines.get(processName) ?? new Map<keyof ChunkFeatures, RunningStat>();
    this.baselines.set(processName, stats);

    const findings: AnomalyFinding[] = [];

    for (const feature of SCORED_FEATURES) {
      if (RESOURCE_FEATURES.has(feature) && chunk.features.resourceSampleCount === 0) {
        continue; // no reading this window — not a real zero, skip entirely
      }

      const stat = stats.get(feature) ?? emptyStat();
      const observed = chunk.features[feature];
      const std = stdOf(stat);

      if (stat.n >= MIN_SAMPLES_BEFORE_SCORING) {
        if (std > 0) {
          const z = (observed - stat.mean) / std;
          if (Math.abs(z) >= Z_SCORE_THRESHOLD) {
            findings.push({
              feature,
              observed,
              baselineMean: Number(stat.mean.toFixed(2)),
              baselineStd: Number(std.toFixed(2)),
              zScore: Number(z.toFixed(2)),
            });
          }
        } else if (observed !== stat.mean) {
          // Zero-variance baseline (this feature has been identical in every
          // prior sample) and the new value differs at all — that's not a
          // statistical edge case to skip, it's the strongest possible signal.
          // Report a sentinel z-score rather than dividing by zero.
          findings.push({
            feature,
            observed,
            baselineMean: Number(stat.mean.toFixed(2)),
            baselineStd: 0,
            zScore: observed > stat.mean ? 99 : -99,
          });
        }
      }

      stats.set(feature, update(stat, observed));
    }

    return findings;
  }

  /** For diagnostics / dashboard display — current learned baseline for a process. */
  baselineSnapshot(processName: string): Record<string, { mean: number; std: number; samples: number }> {
    const stats = this.baselines.get(processName);
    if (!stats) return {};
    const out: Record<string, { mean: number; std: number; samples: number }> = {};
    for (const [feature, stat] of stats) {
      out[feature] = { mean: Number(stat.mean.toFixed(2)), std: Number(stdOf(stat).toFixed(2)), samples: stat.n };
    }
    return out;
  }
}
