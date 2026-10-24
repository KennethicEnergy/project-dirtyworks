import { PROJECT_NAME } from "@dirtyworks/shared";
import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { createGameServer } from "./server";

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel, { service: `${PROJECT_NAME}-server` });

const server = createGameServer({ config, logger, gracefullyShutdown: true });

await server.listen(config.port);
logger.info("game server listening", {
  port: config.port,
  allowedOrigins: config.allowedOrigins,
});
