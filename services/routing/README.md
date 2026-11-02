# StableFlow Routing

One API request to see the ways money can move internationally, what each costs, how long it should take, and which is best. It compares stablecoin, blockchain, FX and local payout routes across providers, like OpenRouter for cross-border payments.

```text
POST /v1/routes/compare  →  10 ranked routes
1. Base                 5234.75 BRL   cost $5.40    150s     99.53%
2. Ethereum             5229.84 BRL   cost $6.33    335s     99.66%
3. Solana               5230.01 BRL   cost $6.30    123s     99.40%
...
```

> **Simulated data, and quotes only.** Fees, rates, durations and reliability figures come from illustrative fixtures in `src/providers/simulated/scenarios.ts`, except that a network transfer stage can use observed conditions when RPC endpoints are configured (see [Live network conditions](#live-network-conditions)). The figures aren't the real costs or performance of any company. Every response labels this, and every quote is a nonbinding estimate. This service moves no money and has no custody, swaps, signing or transfers. A quote doesn't make a payment executable or compliant.

## Quick start

Requires Node 22.18 or later and Docker. Run from this folder, after `npm install` at the repository root.

```bash
cp .env.example .env
docker compose up -d --wait postgres redis
npm run db:deploy
npm run db:seed        # prints a development API key once
npm run dev            # http://localhost:4000
```

Then open **http://localhost:4000/docs**, or:

```bash
curl -X POST http://localhost:4000/v1/routes/compare \
  -H "x-api-key: $STABLEFLOW_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "source": { "country": "US", "currency": "USD", "amount": "1000.00", "fundingMethod": "bank_transfer" },
    "destination": { "country": "BR", "currency": "BRL", "payoutMethod": "pix" },
    "optimizeFor": "balanced"
  }'
```

To try it with no infrastructure, leave `DATABASE_URL` and `REDIS_URL` unset. It then uses an in-memory store and prints a key at startup.

To run the whole stack in containers: `docker compose --profile api up --build`. The image applies migrations on start. Seed from the host as above.

## SDK

```typescript
import { StableFlow } from "@stableflow/sdk";

const stableflow = new StableFlow({ apiKey: process.env.STABLEFLOW_API_KEY });

const result = await stableflow.routes.compare({
  source: { country: "US", currency: "USD", amount: "1000.00", fundingMethod: "bank_transfer" },
  destination: { country: "BR", currency: "BRL", payoutMethod: "pix" },
  optimizeFor: "lowest_cost",
});

console.log(result.recommendation);
```

A runnable example is in `examples/compare-routes`. Amounts are decimal strings, and numbers are rejected to prevent precision loss.

```bash
npm run build -w packages/sdk      # from the repository root
STABLEFLOW_API_KEY=... npm start -w examples/compare-routes
```

## Endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/routes/compare` | Yes | Compare and rank routes |
| `GET /v1/routes/:routeId` | Yes | Stored route, quote version, expiry and assumptions |
| `GET /v1/routes/:routeId/visualization` | Yes | Globe-ready data for a hypothetical route |
| `GET /v1/corridors` | No | Corridors, filterable by `country`, `currency` and `payoutMethod` |
| `GET /v1/providers` | No | Providers, capabilities, mode and health |
| `GET /v1/health` | No | Readiness and dependency health |
| `GET /openapi.json`, `/docs` | No | OpenAPI spec and Swagger UI |

Send keys as `x-api-key` or `Authorization: Bearer`. Routes are only visible to the key that created them. Create more with `npm run keys:create -- "Name"`. Errors always look like `{ "error": { "code", "message", "requestId", "details" } }`.

In sandbox, the `x-simulation-scenario` header selects a seeded scenario: `default`, `solana_congestion`, `base_outage`, `bank_holiday` or `slow_provider`.

### Filters

Under `preferences`, `excludedNetworks` and `excludedProviders` apply before the search. `maxFeeUSD` (compared against total cost, including FX spread), `maxDurationSeconds` and `minSuccessRate` are hard limits applied before scoring, and excluded routes are listed with reasons in `excludedRoutes`. `preferredStablecoins` is also a hard filter on stablecoin routes, while routes that use no stablecoin stay eligible.

An impossible request is an error (`422 unsupported_corridor`). A valid request that nothing satisfies is a `200` with empty `routes` and reasons. Partial provider failures only remove that provider's routes, and appear under `providers`. `503` means no provider produced a usable quote.

## How routing works

```text
funding:bank_transfer:USD:US
  → fiat:USD@venue  → sender:USDC:Base → recipient:USDC:Base
  → fiat:BRL@venue  → payout:pix:BRL:BR
```

**Graph.** Providers return priced edges, not routes, and routes emerge from the search. Valid transitions are enforced in `graph/nodes.ts`. Fiat nodes are scoped to the venue holding the money, while onchain balances aren't, so providers can hand off onchain. That's how a route can on-ramp at one provider, bridge, and off-ramp at another, without anyone defining that route.

**Search.** Yen's k-shortest loopless paths, run once per objective with 10 candidates each, then pooled. This is polynomial, and banning a path's own nodes prevents cycles. The search weights are approximations, so every candidate is then priced exactly. Pooling means the objective changes the order, not the set of routes.

**Ranking.**

| Mode | Orders by |
| --- | --- |
| `lowest_cost` | Total cost to the sender, measured from what actually arrives |
| `fastest` | Sum of every stage's duration, end to end |
| `most_reliable` | Modeled end-to-end success probability |
| `balanced` | Weighted score, by default 50% cost, 30% time, 20% reliability |

Balanced scoring min-max normalizes each dimension across eligible routes, so dollars and seconds are never compared directly. Duration is log-scaled first, or a two-day wire would flatten the gap between 45 seconds and ten minutes. Set weights with `BALANCED_WEIGHT_*`, or per request with `preferences.balancedWeights`. Ties break on cost, duration, reliability, then path identity, so ordering is fully deterministic.

**Reliability.** Multiplying every stage would double-count shared risk, because a provider's on-ramp and off-ramp fail together. Each edge belongs to a failure domain (a provider, network, banking system or payout rail). Stages in a domain are treated as fully correlated, so the domain scores its weakest stage. Separate domains are treated as independent and multiplied. This is a deliberate simplification, listed in each route's `assumptions`.

## Financial accuracy

All money uses `decimal.js` at 40 significant digits, and travels as decimal strings. `number` holds only durations, probabilities and normalized scores.

Amounts propagate stage by stage: each fee applies to what remains at that point, and each conversion acts on the net amount.

**Rounding:**

| Value | Rule | Why |
| --- | --- | --- |
| Fees | Up, to the asset's minor unit | A fee is never understated |
| Stage outputs | Down, to the asset's minor unit | Nobody is promised a fraction that doesn't exist |
| USD reporting | Half-even, 2 places for totals, 6 for breakdowns | Totals don't drift |

Precision follows ISO 4217 (JPY 0, USD 2, KWD 3), with stablecoins at 6. Amounts more precise than the currency allows are rejected.

**Cost terms.** `totalFeeUSD` is explicit fees. `fxSpreadUSD` is what's lost between the customer and reference rates. `totalCostUSD` is the source's value minus the recipient amount's value at reference rates. The difference between that and fees plus spread is `feeBreakdown.rounding`, so each route reconciles exactly. The test suite checks this.

## Reliability of the service

A timeout, outage, rate limit, invalid response or stale quote from one provider becomes a status in `providers` and removes only its routes. Each provider has a timeout (`PROVIDER_TIMEOUT_MS`), concurrency is bounded (`PROVIDER_CONCURRENCY`), and transient failures are retried, because quotes are safe reads. Responses are validated before use, including refusing a customer rate better than its reference rate.

Redis is optional. It shares rate limits between instances and caches provider quotes, never past their expiry and partitioned by environment and scenario.

## Live network conditions

Set `QUICKNODE_ETHEREUM_URL`, `QUICKNODE_BASE_URL` and `QUICKNODE_SOLANA_URL` to replace the invented fee and time on a transfer stage with figures read from the chain. Those stages report `dataSource: "live"`, while the route stays `simulated` because its other stages are. Only the `default` scenario uses them, so the failure scenarios stay reproducible.

| Figure | Source | Assumption |
|---|---|---|
| Ethereum, Base fee | `eth_feeHistory`, Chainlink ETH/USD, plus the OP Stack L1 data fee on Base | 65,000 gas for a token transfer |
| Solana fee | Base fee, `getRecentPrioritizationFees`, Chainlink SOL/USD read from Ethereum | One signature, 10,000 compute units |
| Duration | Recent block or slot time | 12 confirmations on Ethereum, 10 on Base, 32 on Solana |

Solana needs the Ethereum URL too, for its price feed. Readings are reused for `NETWORK_CONDITIONS_TTL_MS` (5 minutes by default), and no chain is read until something asks. `GET /v1/network-conditions` publishes them without an API key, from the same cached readings. `GET /v1/fx-rates` serves ECB reference rates, and `GET /v1/provider-quotes` serves what named providers deliver, from Wise's public comparison data. It stays off unless `PROVIDER_QUOTES_ENABLED=true`, because Wise hasn't confirmed that its data may be republished. `GET /v1/chain-activity` does the same for real USDC and USDT Transfer events from the last few blocks on Ethereum and Base. If an endpoint is missing or a read fails, the stage falls back to its simulated figures and is labeled simulated. These calls are read-only. Endpoint URLs contain access tokens, so treat them as secrets.

Setting `STABLEFLOW_ENV=production` refuses to start until a live provider exists, so simulated figures can't be served as production quotes. See `src/providers/live/README.md` for adding one.

## Globe integration

`GET /v1/routes/:routeId/visualization` returns representative coordinates, segments, estimates and comparison flags (`isCheapest`, `isFastest`, `relativeCost`). Responses set `isRealPayment: false`, `kind: "hypothetical_route"` and `coordinatesAreRepresentative: true`. The coordinates are one fixed city per country, not payment locations, and quoted routes must never be animated as if a payment happened.

## Hosting

The sandbox runs on Vercel at https://stableflow-api-one.vercel.app, with Prisma Postgres and Upstash Redis from the Marketplace. `api/index.mjs` is the Vercel entrypoint and hands requests to the compiled app, while `src/index.ts` serves local and Docker runs.

Deploy from this folder with `vercel deploy --prod`. Apply migrations before deploying a schema change.

## Development

```bash
npm test               # unit and API tests, no services needed
npm run test:infra     # needs docker compose services
npm run typecheck
npm run lint
npm run build
```
