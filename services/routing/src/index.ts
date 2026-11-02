import { bootstrap } from "./bootstrap.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const app = await bootstrap({
  env,
  announceDevKey: (key) => {
    // Deliberately not through the logger: keys must stay out of log pipelines.
    console.log(`\nDevelopment API key (in-memory store, valid until restart):\n  ${key}\n`);
  },
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: env.HOST, port: env.PORT });
app.log.info({ environment: env.STABLEFLOW_ENV, docs: "/docs" }, "StableFlow Routing is ready. Quote comparison only, with simulated data.");
