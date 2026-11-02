import type { PaymentEdge } from "../domain/types.js";
import type { PaymentGraph } from "./graph.js";

export type EdgeWeight = (edge: PaymentEdge) => number;

export interface WeightedPath {
  edges: PaymentEdge[];
  weight: number;
}

interface Exclusions {
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

const pathKey = (edges: readonly PaymentEdge[]) => edges.map((edge) => edge.id).join(">");

const comparePaths = (a: WeightedPath, b: WeightedPath) => {
  if (a.weight !== b.weight) return a.weight - b.weight;
  const keyA = pathKey(a.edges);
  const keyB = pathKey(b.edges);
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
};

/** Dijkstra. Edge weights must be non-negative. */
function shortestPath(
  graph: PaymentGraph,
  start: string,
  goal: string,
  weight: EdgeWeight,
  excluded: Exclusions,
  maxHops: number,
): WeightedPath | null {
  const best = new Map<string, number>([[start, 0]]);
  const via = new Map<string, PaymentEdge>();
  const hops = new Map<string, number>([[start, 0]]);
  const open = new Set<string>([start]);

  while (open.size > 0) {
    let current: string | undefined;
    let currentCost = Infinity;
    // Sorted scan: the graphs are tiny, and this keeps ties deterministic.
    for (const candidate of [...open].sort()) {
      const cost = best.get(candidate)!;
      if (cost < currentCost) {
        current = candidate;
        currentCost = cost;
      }
    }
    if (current === undefined) break;
    open.delete(current);

    if (current === goal) {
      const edges: PaymentEdge[] = [];
      for (let at = goal; at !== start; ) {
        const edge = via.get(at)!;
        edges.unshift(edge);
        at = edge.sourceNode;
      }
      return { edges, weight: currentCost };
    }

    if (hops.get(current)! >= maxHops) continue;
    for (const edge of graph.edgesFrom(current)) {
      if (excluded.edges.has(edge.id) || excluded.nodes.has(edge.destinationNode)) continue;
      const cost = currentCost + weight(edge);
      if (cost < (best.get(edge.destinationNode) ?? Infinity)) {
        best.set(edge.destinationNode, cost);
        via.set(edge.destinationNode, edge);
        hops.set(edge.destinationNode, hops.get(current)! + 1);
        open.add(edge.destinationNode);
      }
    }
  }
  return null;
}

/**
 * Yen's algorithm: the `k` lowest-weight loopless paths, in polynomial time.
 * Each round takes the previous path, and at every node along it finds the best
 * way to deviate, while banning the edges already tried from that prefix.
 * Banning the prefix's nodes is what guarantees no path contains a cycle.
 */
export function kShortestPaths(
  graph: PaymentGraph,
  start: string,
  goal: string,
  k: number,
  weight: EdgeWeight,
  maxHops = 10,
): WeightedPath[] {
  const first = shortestPath(graph, start, goal, weight, { nodes: new Set(), edges: new Set() }, maxHops);
  if (!first) return [];

  const accepted: WeightedPath[] = [first];
  const candidates = new Map<string, WeightedPath>();

  while (accepted.length < k) {
    const previous = accepted.at(-1)!.edges;

    for (let spur = 0; spur < previous.length; spur += 1) {
      const root = previous.slice(0, spur);
      const spurNode = previous[spur]!.sourceNode;
      const rootKey = pathKey(root);

      const bannedEdges = new Set<string>();
      for (const { edges } of accepted) {
        if (edges.length > spur && pathKey(edges.slice(0, spur)) === rootKey) {
          bannedEdges.add(edges[spur]!.id);
        }
      }
      const bannedNodes = new Set(root.map((edge) => edge.sourceNode));
      bannedNodes.add(spurNode);

      const tail = shortestPath(graph, spurNode, goal, weight, { nodes: bannedNodes, edges: bannedEdges }, maxHops - spur);
      if (!tail) continue;

      const edges = [...root, ...tail.edges];
      const key = pathKey(edges);
      if (!candidates.has(key) && !accepted.some((path) => pathKey(path.edges) === key)) {
        candidates.set(key, { edges, weight: edges.reduce((sum, edge) => sum + weight(edge), 0) });
      }
    }

    if (candidates.size === 0) break;
    const next = [...candidates.values()].sort(comparePaths)[0]!;
    candidates.delete(pathKey(next.edges));
    accepted.push(next);
  }
  return accepted;
}
