import type { PaymentEdge } from "../domain/types.js";
import { nodeKind, VALID_TRANSITIONS } from "./nodes.js";

export interface RejectedEdge {
  edgeId: string;
  providerId: string;
  reason: string;
}

export class PaymentGraph {
  private readonly outgoing = new Map<string, PaymentEdge[]>();

  addEdge(edge: PaymentEdge): void {
    const edges = this.outgoing.get(edge.sourceNode) ?? [];
    edges.push(edge);
    // Ordered by id so that search results never depend on provider timing.
    edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    this.outgoing.set(edge.sourceNode, edges);
  }

  edgesFrom(nodeId: string): readonly PaymentEdge[] {
    return this.outgoing.get(nodeId) ?? [];
  }
}

function transitionProblem(edge: PaymentEdge): string | null {
  if (!edge.enabled) return "disabled";
  if (edge.sourceNode === edge.destinationNode) return "self_loop";
  const [from, to] = VALID_TRANSITIONS[edge.kind];
  try {
    if (nodeKind(edge.sourceNode) !== from || nodeKind(edge.destinationNode) !== to) {
      return `invalid_transition:${edge.kind}`;
    }
  } catch {
    return "malformed_node";
  }
  if (edge.inputAsset === edge.outputAsset && (edge.kind === "fx" || edge.kind === "onramp" || edge.kind === "offramp")) {
    return "conversion_without_asset_change";
  }
  return null;
}

export function buildGraph(edges: readonly PaymentEdge[]): { graph: PaymentGraph; rejected: RejectedEdge[] } {
  const graph = new PaymentGraph();
  const rejected: RejectedEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const reason = seen.has(edge.id) ? "duplicate_edge" : transitionProblem(edge);
    if (reason) {
      rejected.push({ edgeId: edge.id, providerId: edge.providerId, reason });
      continue;
    }
    seen.add(edge.id);
    graph.addEdge(edge);
  }
  return { graph, rejected };
}

const MAX_PER_KIND: Readonly<Record<PaymentEdge["kind"], number>> = {
  funding: 1,
  fx: 2,
  onramp: 1,
  bridge: 1,
  transfer: 1,
  offramp: 1,
  payout: 1,
};

/** Rejects paths that are connected but make no sense as a single payment. */
export function isValidPath(path: readonly PaymentEdge[]): boolean {
  const counts = new Map<string, number>();
  const visited = new Set<string>();
  for (const [index, edge] of path.entries()) {
    const count = (counts.get(edge.kind) ?? 0) + 1;
    if (count > MAX_PER_KIND[edge.kind]) return false;
    counts.set(edge.kind, count);
    if (edge.kind === "fx" && path[index - 1]?.kind === "fx") return false;
    if (visited.has(edge.sourceNode)) return false;
    visited.add(edge.sourceNode);
  }
  return !visited.has(path.at(-1)?.destinationNode ?? "");
}
