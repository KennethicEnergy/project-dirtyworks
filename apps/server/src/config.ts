import { z } from "zod";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface ServerConfig {
  port: number;
  jwtSecret: string;
  allowedOrigins: string[];
  dataDir: string;
  logLevel: LogLevel;
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(2567),
  GAME_JWT_SECRET: z
    .string({ error: "GAME_JWT_SECRET is required" })
    .min(32, "GAME_JWT_SECRET must be at least 32 characters"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  DATA_DIR: z.string().min(1).default("./data"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration: ${details}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    jwtSecret: e.GAME_JWT_SECRET,
    allowedOrigins: e.ALLOWED_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    dataDir: e.DATA_DIR,
    logLevel: e.LOG_LEVEL,
  };
}
