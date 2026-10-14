import type { GraphNode, GraphEdge } from "./trust-graph";
export function mergeGraph(
  pages: { nodes: GraphNode[]; edges: GraphEdge[] }[],
) {
  const nodes = new Map<string, GraphNode>(),
    edges = new Map<string, GraphEdge>();
  for (const page of pages) {
    for (const n of page.nodes)
      if (!nodes.has(n.id) || n.status !== "referenced") nodes.set(n.id, n);
    for (const e of page.edges) edges.set(e.id, e);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
/** Cycle-safe neighbourhood over an explicitly loaded graph. No authority is inferred. */
export function neighbourhood(
  nodes: GraphNode[],
  edges: GraphEdge[],
  start: string,
  depth = 2,
) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 8)
    throw Error("Graph depth must be 0–8");
  const known = new Set(nodes.map((n) => n.id));
  if (!known.has(start)) return { nodes: [], edges: [] };
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    if (!adjacency.has(e.to)) adjacency.set(e.to, []);
    adjacency.get(e.from)!.push(e.to);
    adjacency.get(e.to)!.push(e.from);
  }
  const visited = new Set([start]);
  let frontier = [start];
  for (let i = 0; i < depth && frontier.length; i++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const other of adjacency.get(id) || [])
        if (known.has(other) && !visited.has(other)) {
          visited.add(other);
          next.push(other);
        }
    frontier = next;
  }
  return {
    nodes: nodes.filter((n) => visited.has(n.id)),
    edges: edges.filter((e) => visited.has(e.from) && visited.has(e.to)),
  };
}
