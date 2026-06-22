// ============================================================================
// Behavioral Signature Engine
// Signatures are declarative, testable rules matched against a chunk + its
// process lineage. This mirrors how Sigma/YARA-L rules are structured, just
// expressed as typed predicates instead of YAML so they're directly unit-
// testable. Add new signatures by appending to SIGNATURES — nothing else
// needs to change.
// ============================================================================

import type { BehaviorChunk, SignatureHit } from "../types.js";

export interface SignatureContext {
  chunk: BehaviorChunk;
  lineage: string[]; // process names, root -> this entity
}

export interface Signature {
  id: string;
  name: string;
  severity: SignatureHit["severity"];
  weight: number; // contribution to confidence score, roughly 0-40
  description: string;
  match: (ctx: SignatureContext) => boolean;
}

const OFFICE_APPS = ["winword.exe", "excel.exe", "powerpnt.exe", "outlook.exe"];
const SHELLS = ["cmd.exe", "powershell.exe", "pwsh.exe", "wscript.exe", "cscript.exe"];
const LOLBINS = ["certutil.exe", "mshta.exe", "rundll32.exe", "regsvr32.exe", "bitsadmin.exe"];

export const SIGNATURES: Signature[] = [
  {
    id: "SIG-001",
    name: "Office application spawned a shell",
    severity: "high",
    weight: 30,
    description: "A document-handling process (Word/Excel/Outlook) spawned a command interpreter — classic macro-dropper pattern.",
    match: ({ lineage }) => {
      for (let i = 0; i < lineage.length - 1; i++) {
        if (OFFICE_APPS.includes(lineage[i].toLowerCase()) && SHELLS.includes(lineage[i + 1].toLowerCase())) {
          return true;
        }
      }
      return false;
    },
  },
  {
    id: "SIG-002",
    name: "Encoded / obfuscated command line",
    severity: "medium",
    weight: 20,
    description: "Process was launched with a base64-encoded or otherwise obfuscated command line.",
    match: ({ chunk }) => chunk.features.hasEncodedCommandLine === 1,
  },
  {
    id: "SIG-003",
    name: "LOLBin used as a network/process launcher",
    severity: "medium",
    weight: 18,
    description: "A living-off-the-land binary (certutil, mshta, rundll32, regsvr32, bitsadmin) made a network connection or spawned a child process.",
    match: ({ chunk, lineage }) => {
      const last = lineage[lineage.length - 1]?.toLowerCase();
      if (!last || !LOLBINS.includes(last)) return false;
      return chunk.features.networkConnectCount > 0 || chunk.features.childProcessCount > 0;
    },
  },
  {
    id: "SIG-004",
    name: "Mass file write/delete (possible ransomware staging)",
    severity: "critical",
    weight: 35,
    description: "A single process touched an unusually large number of distinct files within one window.",
    match: ({ chunk }) => chunk.features.uniqueFilesTouched >= 25 || chunk.features.fileDeleteCount >= 15,
  },
  {
    id: "SIG-005",
    name: "Credential access event observed",
    severity: "critical",
    weight: 35,
    description: "Process touched a known credential store / LSASS-style memory access.",
    match: ({ chunk }) => chunk.features.credentialAccessCount > 0,
  },
  {
    id: "SIG-006",
    name: "Shell launched directly from a LOLBin chain",
    severity: "high",
    weight: 25,
    description: "A LOLBin is an ancestor of a live shell process — common in fileless execution chains.",
    match: ({ lineage }) => {
      const lower = lineage.map((p) => p.toLowerCase());
      const lolbinIdx = lower.findIndex((p) => LOLBINS.includes(p));
      if (lolbinIdx === -1) return false;
      return lower.slice(lolbinIdx + 1).some((p) => SHELLS.includes(p));
    },
  },
];

export function runSignatures(ctx: SignatureContext, signatures: Signature[] = SIGNATURES): SignatureHit[] {
  const hits: SignatureHit[] = [];
  for (const sig of signatures) {
    try {
      if (sig.match(ctx)) {
        hits.push({
          signatureId: sig.id,
          name: sig.name,
          severity: sig.severity,
          weight: sig.weight,
          description: sig.description,
        });
      }
    } catch {
      // A single bad signature must never take down the pipeline.
      continue;
    }
  }
  return hits;
}
