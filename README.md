# StableFlow

Watch money move at internet speed. A real-time 3D globe of **simulated** international stablecoin transfers, built with Next.js and React Three Fiber.

No API keys, database or payment accounts are needed. Every transaction is generated in the browser and labeled as simulated.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

For a production build, which is the one to judge frame rate on:

```bash
npm run build && npm start
```

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Simulation, geography and aggregate tests |

## Reproducible sessions

The same seed produces the same transactions. Add `?seed=42` to the URL, or set a seed under Settings.

## How it fits together

```text
TransactionProvider ──> network (src/lib/network.ts)
                          ├─ Aggregator      session totals, updated on every event
                          ├─ ArcSystem       GPU flights, written once at launch
                          └─ Zustand store   React snapshot, 4 times a second
```

- **One clock.** `SimulationTransactionProvider` owns simulation time. Speed, pause and hidden tabs all act on it, so the feed, metrics and stars stay in step.
- **Stars cost no per-frame JavaScript.** Each flight is a set of instance attributes written once. The vertex shaders in `arcShaders.ts` compute the great-circle arc, comet and pulses from `uTime`, in four draw calls.
- **Land comes from data.** `earthData.ts` turns Natural Earth TopoJSON (`public/geo`) into a land mask, a dot lattice and border lines when the page loads.
- **The session lives in the layout.** The simulation and globe are mounted from `AppShell`, so moving to Analytics doesn't reset them.

## Route comparison API

`services/routing` is a separate Fastify service that compares international payment routes, with a TypeScript SDK in `packages/sdk`. Its data is also simulated. See [its README](services/routing/README.md).

## Connecting real data

Implement `TransactionProvider` (`src/lib/providers/types.ts`): emit a transaction when first seen, then emit it again under the same `id` when its status changes. `RealTransactionProvider` is a placeholder that documents the rules. In short, raw onchain transfers are not international payments, and geography must come from an authorized source, never inferred.

Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain) through [world-atlas](https://github.com/topojson/world-atlas).
