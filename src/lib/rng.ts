/** Mulberry32: small, fast and deterministic for a given seed. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  random: number,
): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let remaining = random * total;
  for (const item of items) {
    remaining -= weightOf(item);
    if (remaining < 0) return item;
  }
  return items[items.length - 1];
}
