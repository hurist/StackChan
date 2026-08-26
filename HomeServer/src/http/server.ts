import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { getHomeServerStatus } from "../state/connection-state.js";

export function createHttpServer() {
  const app = Fastify({
    logger: true
  });

  app.get("/health", async () => ({
    ok: true,
    ...getHomeServerStatus()
  }));

  app.get("/status", async () => getHomeServerStatus());

  app.get("/robot/status", async () => getHomeServerStatus());

  return app;
}

export async function startHttpServer() {
  const config = loadConfig();
  const app = createHttpServer();

  await app.listen({
    host: config.host,
    port: config.port
  });

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startHttpServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
