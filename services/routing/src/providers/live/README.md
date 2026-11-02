# Adding a live provider

`networkConditions.ts` supplies observed network fees and times to the transfer
stages of the simulated providers. It reads chain data only and isn't a provider.

There are no live provider adapters yet, on purpose. An adapter belongs here only once
we hold credentials and have confirmed from the provider's own documentation
which countries, rails and quote endpoints it offers. Nothing is assumed.

To add one:

1. Implement `QuoteProvider` from `../types.ts`, reading credentials from the
   environment and validating them in `src/config/env.ts`.
2. Map the provider's response onto `ProviderQuote`: one `PaymentEdge` per stage,
   with node ids from `graph/nodes.ts`, `dataSource: "live"`, and amounts as
   decimal strings at each asset's precision. Report `availableLiquidity` only
   when the provider states it.
3. Translate failures into `ProviderError`, marking only transient ones
   retryable. The aggregator handles timeouts, retries, validation and staleness.
4. Register it in `ProviderRegistry`, then lift the production guard in
   `config/env.ts`.

Keep a reference-rate source separate from any provider's customer rate: cost is
measured against mid-market, so a provider can't grade its own spread.

Quoting is all an adapter may do. V1 has no money movement, custody, swaps,
signing or transfers, and a quote doesn't make a payment executable or compliant.
