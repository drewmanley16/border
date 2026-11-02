import { generateApiKey, hashApiKey, keyPrefix } from "../src/http/apiKeys.js";
import { corridorsFromScenario } from "../src/providers/corridors.js";
import { DEFAULT_SCENARIO } from "../src/providers/simulated/scenarios.js";
import { createPrismaClient } from "../src/store/prismaStore.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required to seed the database.");

const db = createPrismaClient(url);

for (const provider of DEFAULT_SCENARIO.providers) {
  const type = provider.kind === "onchain" ? "stablecoin" : provider.kind;
  await db.provider.upsert({
    where: { id: provider.id },
    create: { id: provider.id, name: provider.name, type, dataSource: "simulated", config: { scenarioDriven: true } },
    update: { name: provider.name, type },
  });
}

const corridors = corridorsFromScenario(DEFAULT_SCENARIO);
for (const corridor of corridors) {
  const { sourceCountry, destinationCountry, sourceCurrency, destinationCurrency } = corridor;
  await db.corridor.upsert({
    where: { sourceCountry_destinationCountry_sourceCurrency_destinationCurrency: { sourceCountry, destinationCountry, sourceCurrency, destinationCurrency } },
    create: corridor,
    update: corridor,
  });
}

console.log(`Seeded ${DEFAULT_SCENARIO.providers.length} simulated providers and ${corridors.length} corridors.`);

const key = process.env.SEED_API_KEY ?? generateApiKey();
const keyHash = hashApiKey(key);
const existing = await db.apiKey.findUnique({ where: { keyHash } });
if (!existing) {
  await db.apiKey.create({ data: { name: "Development key", keyHash, keyPrefix: keyPrefix(key), environment: "sandbox" } });
  console.log(`\nDevelopment API key. Copy it now, because only its hash is stored:\n  ${key}\n`);
}

await db.$disconnect();
