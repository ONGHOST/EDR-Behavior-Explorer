// ============================================================================
// Process Graph
// Maintains the live parent→child process topology per host. This is the
// structural backbone other layers query: lineage for the audit trail,
// ancestor-chain checks for signatures, and the graph itself is what a
// SOC dashboard renders for an analyst to pivot through an incident.
// ============================================================================

import type { NormalizedEvent } from "../types.js";

function applyMetadata(node: ProcessNode, details: Record<string, unknown>): void {
  if (typeof details["companyName"] === "string" && details["companyName"]) node.companyName = details["companyName"];
  if (typeof details["description"] === "string" && details["description"]) node.description = details["description"];
  if (typeof details["executablePath"] === "string" && details["executablePath"]) {
    node.executablePath = details["executablePath"];
  }
}

export interface ProcessNode {
  hostId: string;
  pid: number;
  ppid: number;
  processName: string;
  commandLine?: string;
  companyName?: string;
  description?: string;
  executablePath?: string;
  /** Most recent resource_sample reading, if the collector reports them. */
  lastCpuPercent?: number;
  lastWorkingSetBytes?: number;
  lastPrivateBytesBytes?: number;
  lastSampleAt?: number;
  firstSeen: number;
  lastSeen: number;
  terminatedAt?: number;
  children: Set<number>; // child pids
}

export interface GraphSnapshot {
  hostId: string;
  nodes: Array<Omit<ProcessNode, "children"> & { children: number[] }>;
  edges: Array<{ from: number; to: number }>;
}

export class ProcessGraph {
  // hostId -> pid -> node
  private readonly hosts = new Map<string, Map<number, ProcessNode>>();

  ingest(event: NormalizedEvent): void {
    const tree = this.hosts.get(event.hostId) ?? new Map<number, ProcessNode>();
    this.hosts.set(event.hostId, tree);

    if (event.eventType === "process_create") {
      const node: ProcessNode = tree.get(event.pid) ?? {
        hostId: event.hostId,
        pid: event.pid,
        ppid: event.ppid,
        processName: event.processName,
        commandLine: event.commandLine,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        children: new Set(),
      };
      node.lastSeen = event.timestamp;
      node.commandLine = node.commandLine ?? event.commandLine;
      applyMetadata(node, event.details);
      tree.set(event.pid, node);

      const parent = tree.get(event.ppid);
      if (parent) parent.children.add(event.pid);
      return;
    }

    if (event.eventType === "process_terminate") {
      const node = tree.get(event.pid);
      if (node) node.terminatedAt = event.timestamp;
      return;
    }

    // Any other event type just bumps lastSeen / lazily registers the process
    const node = tree.get(event.pid) ?? {
      hostId: event.hostId,
      pid: event.pid,
      ppid: event.ppid,
      processName: event.processName,
      commandLine: event.commandLine,
      firstSeen: event.timestamp,
      lastSeen: event.timestamp,
      children: new Set(),
    };
    node.lastSeen = event.timestamp;

    if (event.eventType === "resource_sample") {
      const { cpuPercent, workingSetBytes, privateBytesBytes } = event.details as Record<string, unknown>;
      if (typeof cpuPercent === "number") node.lastCpuPercent = cpuPercent;
      if (typeof workingSetBytes === "number") node.lastWorkingSetBytes = workingSetBytes;
      if (typeof privateBytesBytes === "number") node.lastPrivateBytesBytes = privateBytesBytes;
      node.lastSampleAt = event.timestamp;
      applyMetadata(node, event.details);
    }

    tree.set(event.pid, node);
  }

  /** Ancestor chain from root ancestor down to (and including) this pid, as process names. */
  lineageOf(hostId: string, pid: number): string[] {
    const tree = this.hosts.get(hostId);
    if (!tree) return [];

    const chain: string[] = [];
    let current = tree.get(pid);
    const visited = new Set<number>();
    while (current && !visited.has(current.pid)) {
      chain.unshift(current.processName);
      visited.add(current.pid);
      if (current.pid === current.ppid) break; // self-parented root guard
      current = tree.get(current.ppid);
    }
    return chain;
  }

  descendantsOf(hostId: string, pid: number): ProcessNode[] {
    const tree = this.hosts.get(hostId);
    if (!tree) return [];
    const root = tree.get(pid);
    if (!root) return [];

    const out: ProcessNode[] = [];
    const stack = [...root.children];
    const visited = new Set<number>();
    while (stack.length) {
      const childPid = stack.pop()!;
      if (visited.has(childPid)) continue;
      visited.add(childPid);
      const child = tree.get(childPid);
      if (child) {
        out.push(child);
        stack.push(...child.children);
      }
    }
    return out;
  }

  snapshot(hostId: string): GraphSnapshot | null {
    const tree = this.hosts.get(hostId);
    if (!tree) return null;

    const nodes = [...tree.values()].map((n) => ({ ...n, children: [...n.children] }));
    const edges = nodes
      .filter((n) => tree.has(n.ppid) && n.pid !== n.ppid)
      .map((n) => ({ from: n.ppid, to: n.pid }));

    return { hostId, nodes, edges };
  }
}
