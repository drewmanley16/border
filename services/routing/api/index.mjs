import { bootstrap } from "../dist/bootstrap.js";
import { loadEnv } from "../dist/config/env.js";

// Built once per instance, then shared by the requests that instance handles.
const ready = bootstrap({ env: loadEnv() }).then(async (app) => {
  await app.ready();
  return app;
});

/** Vercel entrypoint. Local and Docker runs use src/index.ts instead. */
export default async function handler(request, response) {
  const app = await ready;
  app.server.emit("request", request, response);
}
