import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { fileURLToPath } from "node:url";
import { loadConfig, type HomeServerConfig } from "../config.js";
import { getHomeServerStatus } from "../state/connection-state.js";
import { registerRobotSocket } from "../stackchan/client.js";

function isAuthorizedRobotRequest(authorization: string | undefined, config: HomeServerConfig): boolean {
  if (!config.stackchanSharedSecret) {
    return true;
  }
  return authorization === `Bearer ${config.stackchanSharedSecret}`;
}

export async function createHttpServer(config: HomeServerConfig = loadConfig()) {
  const app = Fastify({
    logger: true
  });

  await app.register(fastifyWebsocket);

  app.get("/health", async () => ({
    ok: true,
    ...getHomeServerStatus()
  }));

  app.get("/status", async () => getHomeServerStatus());

  app.get("/robot/status", async () => getHomeServerStatus());

  app.get("/robot/ws", { websocket: true }, (socket, request) => {
    if (!isAuthorizedRobotRequest(request.headers.authorization, config)) {
      request.log.warn("Rejected unauthorized robot websocket connection");
      socket.close(1008, Buffer.from("unauthorized"));
      return;
    }

    registerRobotSocket(socket, {
      info: (message, extra) => request.log.info(extra, message),
      warn: (message, extra) => request.log.warn(extra, message),
      error: (message, extra) => request.log.error(extra, message)
    });
  });

  return app;
}

export async function startHttpServer(config: HomeServerConfig = loadConfig()) {
  const app = await createHttpServer(config);

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
