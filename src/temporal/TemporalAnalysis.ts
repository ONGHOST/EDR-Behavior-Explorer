// ============================================================================
// Temporal Analysis
// Two complementary techniques:
//  1) Sequence detection — does an ordered subsequence of event types occur
//     within a bounded time delta (e.g. spawn -> connect -> write within 5s)?
//  2) Beaconing detection — for repeated network connections to the same
//     destination, is the inter-arrival interval suspiciously regular (low
//     coefficient of variation), which is the signature of C2 polling?
// ============================================================================

import type { BehaviorChunk, NormalizedEvent, TemporalFinding } from "../types.js";

interface SequenceRule {
  name: string;
  steps: NormalizedEvent["eventType"][];
  maxGapMs: number;
  score: number;
}

const SEQUENCE_RULES: SequenceRule[] = [
  {
    name: "Rapid spawn → network → write (dropper pattern)",
    steps: ["process_create", "network_connect", "file_write"],
    maxGapMs: 5_000,
    score: 0.35,
  },
  {
    name: "Module load immediately followed by credential access",
    steps: ["module_load", "credential_access"],
    maxGapMs: 2_000,
    score: 0.4,
  },
];

const BEACON_MIN_OCCURRENCES = 4;
const BEACON_MAX_CV = 0.15; // coefficient of variation threshold — lower = more regular = more suspicious

export function analyzeTemporal(chunk: BehaviorChunk): TemporalFinding[] {
  const findings: TemporalFinding[] = [];
  findings.push(...detectSequences(chunk));
  findings.push(...detectBeaconing(chunk));
  return findings;
}

function detectSequences(chunk: BehaviorChunk): TemporalFinding[] {
  const findings: TemporalFinding[] = [];
  const events = chunk.events;

  for (const rule of SEQUENCE_RULES) {
    let stepIdx = 0;
    let windowStartEvent: NormalizedEvent | null = null;
    const evidence: string[] = [];

    for (const e of events) {
      if (e.eventType !== rule.steps[stepIdx]) continue;

      if (stepIdx === 0) {
        windowStartEvent = e;
        evidence.length = 0;
      } else if (windowStartEvent && e.timestamp - windowStartEvent.timestamp > rule.maxGapMs) {
        // Gap exceeded — restart the match from this event if it's a valid step 0
        stepIdx = 0;
        windowStartEvent = null;
        evidence.length = 0;
        if (e.eventType === rule.steps[0]) {
          windowStartEvent = e;
        } else {
          continue;
        }
      }

      evidence.push(`${e.eventType}@${e.timestamp}`);
      stepIdx++;

      if (stepIdx === rule.steps.length) {
        findings.push({
          kind: "sequence",
          description: rule.name,
          score: rule.score,
          evidence: [...evidence],
        });
        stepIdx = 0;
        windowStartEvent = null;
        evidence.length = 0;
      }
    }
  }

  return findings;
}

function detectBeaconing(chunk: BehaviorChunk): TemporalFinding[] {
  const byDestination = new Map<string, number[]>();
  for (const e of chunk.events) {
    if (e.eventType !== "network_connect") continue;
    const dest = String(e.details["remoteAddr"] ?? e.details["destination"] ?? "unknown");
    const arr = byDestination.get(dest) ?? [];
    arr.push(e.timestamp);
    byDestination.set(dest, arr);
  }

  const findings: TemporalFinding[] = [];
  for (const [dest, timestamps] of byDestination) {
    if (timestamps.length < BEACON_MIN_OCCURRENCES) continue;
    timestamps.sort((a, b) => a - b);

    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) intervals.push(timestamps[i] - timestamps[i - 1]);

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
    const std = Math.sqrt(variance);
    const cv = mean > 0 ? std / mean : Infinity;

    if (cv <= BEACON_MAX_CV) {
      findings.push({
        kind: "beaconing",
        description: `Regular periodic connections to ${dest} (~${Math.round(mean / 1000)}s interval, CV=${cv.toFixed(2)})`,
        score: Math.min(0.45, 0.25 + (BEACON_MAX_CV - cv)), // tighter regularity = higher score
        evidence: timestamps.map((t) => `connect@${t}`),
      });
    }
  }

  return findings;
}
