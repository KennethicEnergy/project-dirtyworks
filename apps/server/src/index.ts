import { PROJECT_NAME } from "@dirtyworks/shared";
import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { createFileSnapshotStore } from "./persistence/SnapshotStore";
import { createGameServer } from "./server";

const SWEEP_EVERY_MS = 60 * 60 * 1000;

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel, { service: `${PROJECT_NAME}-server` });
const store = createFileSnapshotStore(config.dataDir);

const sweep = () =>
  store
    .sweep()
    .then((n) => n && logger.info("expired saved tables removed", { count: n }))
    .catch((err) => logger.error("saved table sweep failed", { err }));
await sweep();
setInterval(sweep, SWEEP_EVERY_MS).unref();

const server = createGameServer({ config, logger, store, gracefullyShutdown: true });

await server.listen(config.port);
logger.info("game server listening", {
  port: config.port,
  allowedOrigins: config.allowedOrigins,
  dataDir: config.dataDir,
});
