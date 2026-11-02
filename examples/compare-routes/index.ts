import { StableFlow, StableFlowError } from "@stableflow/sdk";

const stableflow = new StableFlow({
  apiKey: process.env.STABLEFLOW_API_KEY,
  baseUrl: process.env.STABLEFLOW_URL ?? "http://localhost:4000",
});

try {
  const quote = await stableflow.routes.compare({
    source: { country: "US", currency: "USD", amount: "1000.00", fundingMethod: "bank_transfer" },
    destination: { country: "BR", currency: "BRL", payoutMethod: "pix" },
    optimizeFor: "balanced",
  });

  console.log(`${quote.sourceAmount} ${quote.sourceCurrency} to ${quote.destinationCurrency}`);
  console.log(`${quote.dataProvenance.note}\n`);

  for (const route of quote.routes) {
    const via = route.networks.join(" then ") || "Bank and FX";
    console.log(
      `${route.rank}. ${via.padEnd(20)} ${route.estimatedDestinationAmount.padStart(10)} ${route.destinationCurrency}` +
        `   cost $${route.totalCostUSD.padStart(6)}   ${route.estimatedDurationSeconds}s   ${(route.estimatedSuccessRate * 100).toFixed(2)}%`,
    );
  }
  console.log(`\n${quote.recommendation}`);

  const best = quote.routes[0];
  if (best) {
    const map = await stableflow.routes.visualization(best.id);
    console.log(`\nFor the globe: ${map.origin.city} to ${map.destination.city} (representative locations, hypothetical route)`);
  }
} catch (error) {
  if (error instanceof StableFlowError) {
    console.error(`${error.code}: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
