/** Project-wide rates and limits shared by the web client and the game server. */

/** Client → server vehicle state messages per second. */
export const NET_SEND_HZ = 20;
/** Remote vehicles are rendered this far behind the newest server sample. */
export const INTERP_DELAY_MS = 100;
/** Server patch interval (ms) — matches NET_SEND_HZ. */
export const PATCH_INTERVAL_MS = 1000 / NET_SEND_HZ;

/** Seconds a dropped player's seat is held for reconnection. */
export const RECONNECT_SECONDS = 20;
/** Live tables one user may host at the same time. */
export const MAX_TABLES_PER_USER = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MAX_SPECTATORS = 8;

export const CHAT_MAX_LEN = 200;
export const CHAT_HISTORY = 50;

/** Terrain op intents a player may send per second. */
export const TERRAIN_OPS_PER_SEC = 10;
/** Vehicle state messages a player may send per second (20 Hz + headroom). */
export const STATE_MSGS_PER_SEC = 25;

/** Game token lifetime in seconds. */
export const GAME_TOKEN_TTL_SEC = 300;

/** Saved ("keep for later") tables. */
export const SAVED_TABLE_MAX_BYTES = 1024 * 1024;
export const SAVED_TABLES_PER_USER = 5;
export const SAVED_TABLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const GRAVITY = 9.81;
