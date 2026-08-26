import { loadConfig } from "./config.js";
import { startHttpServer } from "./http/server.js";
import { startTelegramBot } from "./telegram/bot.js";

const config = loadConfig();
const httpServer = await startHttpServer(config);

const telegramBot = startTelegramBot(config, {
  info: (message, extra) => (extra ? httpServer.log.info(extra, message) : httpServer.log.info(message)),
  warn: (message, extra) => (extra ? httpServer.log.warn(extra, message) : httpServer.log.warn(message)),
  error: (message, extra) => (extra ? httpServer.log.error(extra, message) : httpServer.log.error(message))
});

const shutdown = async (signal: NodeJS.Signals) => {
  httpServer.log.info({ signal }, "Shutting down HomeServer");
  await telegramBot?.stop();
  await httpServer.close();
};

process.once("SIGINT", (signal) => {
  shutdown(signal).catch((error) => {
    httpServer.log.error(error, "HomeServer shutdown failed");
    process.exitCode = 1;
  });
});

process.once("SIGTERM", (signal) => {
  shutdown(signal).catch((error) => {
    httpServer.log.error(error, "HomeServer shutdown failed");
    process.exitCode = 1;
  });
});
