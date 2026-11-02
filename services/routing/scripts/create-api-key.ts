import { generateApiKey, hashApiKey, keyPrefix } from "../src/http/apiKeys.js";
import { createPrismaClient } from "../src/store/prismaStore.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");

const name = process.argv[2] ?? "Sandbox key";
const db = createPrismaClient(url);
const key = generateApiKey();
await db.apiKey.create({ data: { name, keyHash: hashApiKey(key), keyPrefix: keyPrefix(key), environment: "sandbox" } });
await db.$disconnect();
console.log(`${name}. Copy it now, because only its hash is stored:\n  ${key}`);
