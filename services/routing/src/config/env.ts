import { z } from "zod";

const optionalText = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

/** An endpoint URL holds its access token, so errors must name only the variable. */
const rpcUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url({ protocol: /^https$/, error: "must be an https URL" }).optional());

const schema = z.object({
  STABLEFLOW_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: optionalText,
  REDIS_URL: optionalText,
  CORS_ORIGINS: z.string().default("").transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(2_000),
  PROVIDER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  PROVIDER_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  MAX_QUOTE_AGE_MS: z.coerce.number().int().positive().default(60_000),
  BALANCED_WEIGHT_COST: z.coerce.number().min(0).default(0.5),
  BALANCED_WEIGHT_DURATION: z.coerce.number().min(0).default(0.3),
  BALANCED_WEIGHT_RELIABILITY: z.coerce.number().min(0).default(0.2),
  SIMULATION_SCENARIO: z.string().default("default"),
  DEV_API_KEY: optionalText,
  /** How long a chain reading is reused. This sets the RPC spend, whatever the traffic. */
  NETWORK_CONDITIONS_TTL_MS: z.coerce.number().int().min(30_000).default(300_000),
  /** Off until Wise confirms its comparison data may be republished. */
  PROVIDER_QUOTES_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  QUICKNODE_SOLANA_URL: rpcUrl,
  QUICKNODE_ETHEREUM_URL: rpcUrl,
  QUICKNODE_BASE_URL: rpcUrl,
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment:\n${problems}`);
  }
  const env = parsed.data;
  if (env.STABLEFLOW_ENV === "production") {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required when STABLEFLOW_ENV=production.");
    // Simulated figures must never be served as production quotes.
    throw new Error("STABLEFLOW_ENV=production needs a live provider, and none is implemented. Use sandbox.");
  }
  if (env.BALANCED_WEIGHT_COST + env.BALANCED_WEIGHT_DURATION + env.BALANCED_WEIGHT_RELIABILITY <= 0) {
    throw new Error("At least one BALANCED_WEIGHT_* value must be greater than zero.");
  }
  return env;
}
