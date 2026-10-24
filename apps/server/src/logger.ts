/** Structured JSON-lines logger. One object per line: ts, level, msg, bindings, fields. */
import type { LogLevel } from "./config";

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export function createLogger(
  level: LogLevel,
  bindings: LogFields = {},
  sink: (line: string) => void = (line) => process.stdout.write(line + "\n"),
): Logger {
  const min = RANK[level];
  const write = (lvl: LogLevel, msg: string, fields?: LogFields) => {
    if (RANK[lvl] < min) return;
    const entry: LogFields = { ts: new Date().toISOString(), level: lvl, msg, ...bindings };
    if (fields) for (const [k, v] of Object.entries(fields)) entry[k] = serialize(v);
    sink(JSON.stringify(entry));
  };
  return {
    debug: (msg, fields) => write("debug", msg, fields),
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
    child: (more) => createLogger(level, { ...bindings, ...more }, sink),
  };
}

/** A logger that discards everything (tests). */
export const silentLogger: Logger = createLogger("error", {}, () => {});
