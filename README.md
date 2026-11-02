# StableFlow

Real USDC and USDT transfers and network fees, read from public blockchains and shown beside a 3D globe. Built with Next.js and React Three Fiber.

The page reads `services/routing`, which reads the chains. Nothing is simulated in this UI. If a chain can't be read, the page shows no figure for it. Set `NEXT_PUBLIC_ROUTING_API_URL` to use a local API.

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
| `npm test` | Live data summary and formatting tests |

## How it fits together

- **One source.** `src/store/liveStore.ts` polls `/v1/network-conditions` and `/v1/chain-activity` every 5 minutes, and stops while the tab is hidden.
- **Spend is bounded on the server.** The API reuses each chain reading for `NETWORK_CONDITIONS_TTL_MS`, so visitors never add RPC calls.
- **No geography.** Chains don't record locations, so the globe shows no routes, and transfers link to block explorers instead.
- **Land comes from data.** `earthData.ts` turns Natural Earth TopoJSON (`public/geo`) into a land mask, a dot lattice and border lines when the page loads.

## Route comparison API

`services/routing` is a separate Fastify service that compares international payment routes, with a TypeScript SDK in `packages/sdk`. Its quotes are simulated, apart from network fees and times when RPC endpoints are set. See [its README](services/routing/README.md).

Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain) through [world-atlas](https://github.com/topojson/world-atlas).
