# project-dirtyworks — design spec

Date: 2026-10-24
Status: draft for review
Sources: three briefs (frame, terrain digging, cafe pivot), merged. Where they conflict, the later brief wins; every such resolution is listed in §2.

## 1. What we are building

A cozy online "RC hobby cafe". Grown-ups sign in with Google, walk into an illustrated cafe, pick a **table** (a miniature sandbox diorama) from the chalkboard, and drive remote-control construction vehicles together: excavators and wheel loaders dig, dump trucks haul, bulldozers push, dumping makes piles. Every player at a table sees the same vehicles and the same terrain in real time. No death, no forced scores.

Success criteria:

- `npm run dev` starts web and server; two browser sessions can sign in, open a table, drive, dig, dump, chat, emote, and a third session can join late and see identical terrain (terrain hash equal).
- `npm run build`, `npm run lint` and `npm test` pass in every workspace.
- Stable 60 fps with 4 vehicles digging on a mid-range laptop; no collider rebuild above 8 ms.

Out of scope (listed as next ideas in the README): server-authoritative physics, hauling missions/economy, leaderboards, voice chat, GLB art, real audio files, accounts database.

## 2. Decisions and conflict resolutions

| Topic           | Decision                                                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naming          | Build directly as `project-dirtyworks`, npm scope `@dirtyworks`. No warehouse-sim stage.                                                                                                            |
| Maps            | The four tables replace the four original maps: Backyard Sandbox, Mini Quarry (fully built), Construction Yard, Beach Dig Site.                                                                     |
| Table size      | Per-map in `maps.ts`. Mini Quarry 128×128 m (4×4 chunks), others 96×96 m (3×3 chunks). 1 m cells, 32×32-cell chunks. Sizes must be multiples of 32. Physics stays real scale.                       |
| Max players     | 2–8 drivers per table, plus up to 8 spectators.                                                                                                                                                     |
| Display names   | Google profile name only (brief 3 overrides brief 1's "edit once"). The profile dialog edits livery only.                                                                                           |
| Colyseus client | `@colyseus/sdk` 0.18 (the brief's `colyseus.js` is frozen at 0.16 and incompatible with server 0.18).                                                                                               |
| Server browser  | Colyseus `LobbyRoom` realtime listing (0.18 has no `getAvailableRooms`).                                                                                                                            |
| Tool keys       | G is the garage. Tool axes: Q/E, R/F, I/K, J/L. All remappable in `controls.ts`.                                                                                                                    |
| Camera          | V cycles Operator (default) → Chase → Free orbit.                                                                                                                                                   |
| Dev login       | Auth.js Credentials "guest" provider, registered only when `AUTH_DEV_LOGIN=true` and `NODE_ENV !== "production"`. Production is Google-only.                                                        |
| Terrain sync    | Approach A: server applies ops in order and owns bucket/bed loads; clients apply only server-broadcast ops (including their own).                                                                   |
| Runtime         | Node 24 LTS (`engines.node >=22.12`). TypeScript 6.0.x (typescript-eslint does not support TS 7 yet).                                                                                               |
| Saved tables    | Compressed snapshot files on server disk under `DATA_DIR`. Needs a volume on Fly.io/Railway.                                                                                                        |
| Challenges      | 7 static daily challenges, manual "I did it!" check-off stored in localStorage. No auto-detection yet.                                                                                              |
| Audio           | `playSound`/`setLoop` hook layer; default implementation is a tiny WebAudio oscillator synth (horn, servo whine, engine hum, cafe hum). No audio files. Cafe radio shows 3 channel names, no audio. |

## 3. Repository layout

```
project-dirtyworks/
  package.json            npm workspaces, root scripts (dev, build, test, lint, format)
  tsconfig.base.json      strict TS settings shared by all workspaces
  eslint.config.mjs       flat config (typescript-eslint + next for apps/web)
  .prettierrc
  .env.example
  README.md
  apps/
    web/                  @dirtyworks/web     Next.js 16 App Router, Tailwind v4, R3F
    server/               @dirtyworks/server  Colyseus 0.18 game server
  packages/
    shared/               @dirtyworks/shared  pure TS: types, zod schemas, constants, game logic
  docs/superpowers/       specs and plans
```

`@dirtyworks/shared` ships TypeScript source (no build step). Next consumes it with `transpilePackages`; the server runs it through `tsx` in dev and bundles it with esbuild for production. `npm run dev` uses `concurrently` to start web (port 3000) and server (port 2567).

Dependencies (runtime):

- shared: `zod`, `fflate`
- server: `@colyseus/core`, `@colyseus/ws-transport`, `@colyseus/schema`, `jose`, `zod`, `fflate`
- web: `next`, `react`, `react-dom`, `next-auth@beta`, `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, `zustand`, `@colyseus/sdk`, `@colyseus/schema`, `jose` (mint tokens)

Dev: `typescript`, `vitest`, `@colyseus/testing`, `tsx`, `esbuild`, `concurrently`, `eslint`, `typescript-eslint`, `eslint-config-next`, `prettier`, `tailwindcss`, `@tailwindcss/postcss`, `@types/*`.

## 4. Shared package (`packages/shared/src`)

All modules are pure TypeScript with no three/rapier/DOM imports, so server and client run identical logic.

| Module          | Contents                                                                                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constants.ts`  | Rates and limits: `NET_SEND_HZ=20`, `INTERP_DELAY_MS=100`, `RECONNECT_SECONDS=20`, `MAX_TABLES_PER_USER=3`, `CHAT_MAX_LEN=200`, `CHAT_HISTORY=50`, `TERRAIN_OPS_PER_SEC=10`, `MAX_SPECTATORS=8`, token TTL 300 s. |
| `math.ts`       | Minimal `Vec3`/`Quat` plain-object helpers (allocation-free variants with `out` params).                                                                                                                          |
| `vehicles.ts`   | `VehicleSpec` data for excavator, dump truck, bulldozer, wheel loader + zod schema + `validateVehicleSpec`, `clampJoints`, `toolTip(spec, pose, joints, out)` forward kinematics.                                 |
| `maps.ts`       | `TableMap` definitions (see §4.2) + zod schema.                                                                                                                                                                   |
| `materials.ts`  | Material presets: sand, gravel, damp dirt (§4.3).                                                                                                                                                                 |
| `terrain.ts`    | Chunked heightmap, base terrain generation, `applyBrush`, angle-of-repose relaxation, hashing (§6).                                                                                                               |
| `terrainOps.ts` | Op types, quantization, op validation rules shared by server (§6.4).                                                                                                                                              |
| `snapshot.ts`   | Snapshot encode/decode with fflate (§6.5).                                                                                                                                                                        |
| `movement.ts`   | `validateMovement(prev, next, spec, map, dtSec)` → `{ ok, reason, corrected }` (§5.3).                                                                                                                            |
| `rateLimit.ts`  | Token bucket with injectable clock (chat, emotes, terrain ops, state updates).                                                                                                                                    |
| `tables.ts`     | `TableSettings` zod schema (name, map, vibe, rule, maxPlayers, visibility, password, material, keepForLater), `canCreateTable`, `canJoinAs(role, counts, settings)`, invite code format, host succession.         |
| `livery.ts`     | Allowed colors (8 named hex values), decals (`none`, `stripes`, `number`, `checker`), number 0–99, zod schema.                                                                                                    |
| `emotes.ts`     | Emote ids (`thumbs-up`, `laugh`, `nice-dig`, `my-turn`, `horn`), key mapping, rate limit config.                                                                                                                  |
| `chat.ts`       | `sanitizeChat` (trim, strip control chars, 200 chars), `profanityFilter` stub hook.                                                                                                                               |
| `challenges.ts` | 7 challenges + `challengeForDate(date)` (UTC day index mod 7).                                                                                                                                                    |
| `messages.ts`   | Message type names and zod schemas for every client→server and server→client message (§5.2).                                                                                                                      |
| `battery.ts`    | `drainBattery`, `batterySpeedFactor`, charging-station radius.                                                                                                                                                    |
| `auth.ts`       | Game token claim schema (`sub`, `name`, `avatar`), avatar URL allowlist (`*.googleusercontent.com`).                                                                                                              |

### 4.1 Vehicles

`VehicleSpec` fields: `id`, `displayName`, `blurb`, `drive` (`wheeled` | `tracked`), `articulated` (loader), `mass`, `chassis` (box size, center-of-mass offset), `wheels` (position, radius, steer, drive) or `tracks` (width, length, gauge), `maxSpeed` (m/s), `maxAccel`, `steer` (max angle or turn rate), `suspension` (stiffness, damping, travel — tuned soft for RC float), `joints[]`, `tool`, `battery`.

Joint: `{ id, label, axis, min, max, speed, rest, node, input }` where `node` is the GLB node name (`cab`, `boom`, `stick`, `bucket`, `bed`, `blade`, `arm`, `tilt`) and `input` names the tool axis it listens to.

Tool: `{ kind: "bucket" | "bed" | "blade", capacityM3, reach, brushRadius, maxDigDepth, dumpAngle? }`.

| Vehicle      | Drive                | Joints (keys)                                               | Tool                       |
| ------------ | -------------------- | ----------------------------------------------------------- | -------------------------- |
| Excavator    | tracked              | cab swing (Q/E), boom (R/F), stick (I/K), bucket curl (J/L) | bucket 1.2 m³, reach 9 m   |
| Dump truck   | wheeled              | bed tilt (R/F)                                              | bed 12 m³, dumps above 40° |
| Bulldozer    | tracked              | blade height (R/F), blade tilt (I/K)                        | blade, reach 4 m           |
| Wheel loader | wheeled, articulated | arm lift (R/F), bucket tilt (I/K)                           | bucket 2.5 m³, reach 5 m   |

### 4.2 Table maps

`TableMap`: `id`, `displayName`, `tagline`, `size` (cells x/z), `baseTerrain` (generator id + params), `bedrock` rules, `maxHeight`, `spawnPoints[]`, `bounds`, `obstacles[]` (`cone`, `pallet`, `toy-house`, `tree`, `rock`, `barrier`, `shed`, `charging-station`; position, yaw, scale), `ambience` (palette, fog, sun direction/color, sky/backdrop colors, day/night variants), `defaultMaterial`, `tabletop` (`wood` | `concrete`, rim width/height).

Base terrain generators use only `+ − × ÷`, `Math.sqrt` and an integer hash value-noise, then quantize, so they are deterministic everywhere.

- Mini Quarry (128 m): bowl-shaped pit with rock walls (bedrock = surface on the walls), a ramp road from the rim to the pit floor, a flat loading area, rocks, piles, barriers, sheds, a charging station.
- Backyard Sandbox, Construction Yard, Beach Dig Site (96 m): gently noisy flat ground, own palette and material, a handful of props.

### 4.3 Material presets

| Preset    | Repose angle | Look                                    | Particles  |
| --------- | ------------ | --------------------------------------- | ---------- |
| sand      | 30°          | pale warm sand / light dirt / grey rock | pale tan   |
| gravel    | 38°          | grey-brown gravel blend                 | grey       |
| damp dirt | 45°          | dark brown                              | dark brown |

Each preset stores the repose limit as a precomputed integer of height quanta per cell (no runtime trig), three blend colors, particle color, and a dig softness multiplier.

## 5. Auth, tables, networking

### 5.1 Auth

1. Landing page: "Sign in with Google" (Auth.js v5, Google provider). Dev guest form appears only when the guest provider is registered.
2. Next 16 proxy (formerly middleware) protects `/cafe` and `/table/*`; unauthenticated users are redirected to `/`.
3. The session callback strips `email`; it never reaches client components.
4. `GET /api/game-token` (authenticated route handler) mints an HS256 JWT with `jose`: `{ sub, name, avatar }`, `exp` 5 min, `iss: dirtyworks-web`, `aud: dirtyworks-server`. The avatar is dropped unless its host matches `*.googleusercontent.com`.
5. The client sets the token on the SDK (`client.auth.token`) before every matchmake/join; the server verifies it in the room's static `onAuth(token, options, context)`. The lobby room requires the same token.
6. Avatars render as `<img referrerPolicy="no-referrer">` with an initials fallback.

### 5.2 Rooms ("tables") and messages

Colyseus room types: `lobby` (subclass of `LobbyRoom` with auth) and `table` (`TableRoom`, realtime listing enabled). UI copy always says "table".

Listing metadata: `tableId`, `name`, `mapId`, `vibe` (`chill` | `contest` | `beginners`), `rule` (`free-play` | `pile-contest` | `build-the-road`), `hostName`, `locked` (password), `players`, `maxPlayers`, `spectators`.

Creation (`onCreate`): settings validated with zod; the creator's token is verified; `canCreateTable` rejects a 4th live table for the same user. Password stored as scrypt hash. Private tables call `setPrivate(true)` and are reachable only by invite code. Every table gets a 6-character invite code (unambiguous alphabet).

Join (`onAuth`): token valid → not banned → password correct (if locked) → `canJoinAs(role)` (driver seats ≤ `maxPlayers`, spectators ≤ 8). A full driver table answers with `TABLE_FULL` so the client can offer "spectate or wait".

HTTP routes on the game server: `GET /health`, `GET /tables/code/:code` (Bearer token) → `{ roomId, locked }`, `GET /tables/saved` and `DELETE /tables/saved/:id` (Bearer token, owner only).

Lifecycle: `autoDispose` when empty. `onDrop` → `allowReconnection(client, 20)`; the player's vehicle stays in place, marked disconnected. `onLeave` removes the player; if the host leaves, the earliest-joined remaining player becomes host. Host-only messages: `kick`, `ban` (session ban by user id), `closeTable`, `setDayNight`, `terrainReset`, `setKeepForLater`.

Room state (`@colyseus/schema` v5 `schema()` API, patch rate 50 ms):

- `TableState`: `tableId`, `name`, `mapId`, `materialId`, `vibe`, `rule`, `hostId`, `dayNight`, `keepForLater`, `players: map<Player>`
- `Player`: `sessionId`, `userId`, `name`, `avatar`, `role`, `connected`, `vehicle`, livery (`color`, `decal`, `number`), pose (`x y z`, `qx qy qz qw` float32), velocity (`vx vy vz`), `joints` (array<float32>), `load` (uint32 quanta), `moved` (uint32 quanta), `battery` (uint8), `edgeT` (operator spot along the table rim, float32), `ping` (uint16), `t` (server ms of last accepted update)

Messages (all validated with zod via Colyseus 0.18 message validation, all rate limited per client):

| Client → server | Payload                                                                       | Limit              |
| --------------- | ----------------------------------------------------------------------------- | ------------------ |
| `state`         | pose, velocity, joints, vehicle, edgeT, battery, client time                  | 25/s               |
| `spawn`         | vehicle id, livery                                                            | 2/s                |
| `terrainOp`     | `dig` / `release` / `dump` / `push` with quantized params                     | 10/s               |
| `terrainResync` | `fromSeq`                                                                     | 1/s                |
| `chat`          | text                                                                          | 1/s, burst 3       |
| `emote`         | emote id                                                                      | 1 per 2 s, burst 3 |
| `livery`        | livery                                                                        | 1/s                |
| `report`        | target session, reason                                                        | 1 per 10 s         |
| `pong`          | ping id                                                                       | 1/s                |
| host-only       | `kick`, `ban`, `closeTable`, `setDayNight`, `terrainReset`, `setKeepForLater` | 2/s                |

| Server → client                                                                         | Payload                                                      |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `welcome`                                                                               | your role, table seq, snapshot bytes, chat history (last 50) |
| `terrainOp`                                                                             | compact op: `[seq, kind, params…, bySession, appliedQuanta]` |
| `terrainSnapshot`                                                                       | resync reply: seq + snapshot bytes                           |
| `correction`                                                                            | last valid pose after a rejected movement                    |
| `chat`, `emote`, `notice` (join/leave/kick/host change), `ping`, `tableClosed`, `error` |

Hard limits: messages failing zod are dropped and logged; repeated violations (20 in 10 s) disconnect the client. Colyseus `maxMessagesPerSecond = 60` as a backstop.

### 5.3 Movement model

Client-authoritative movement with server validation:

- Clients simulate their own vehicle with Rapier and send `state` at 20 Hz.
- `validateMovement` checks: vehicle matches the spawned one; joints within limits (clamped); position inside map bounds (+2 m margin) and above the tabletop floor; speed ≤ 1.25 × `maxSpeed` + 1 m/s; displacement ≤ (1.3 × `maxSpeed`) × dt + 0.75 m with dt measured server-side (clamped 0.04–0.5 s); horizontal acceleration ≤ 1.5 × `maxAccel` + 2 m/s², vertical ≤ 2 g.
- Failures keep the previous pose; three consecutive failures send `correction` and the client snaps back. Spawning is the only allowed teleport.
- Remote vehicles: clients keep a 100 ms interpolation buffer keyed by server time `t` (offset estimated from the lowest observed latency), interpolate position (lerp) and rotation (slerp), and never simulate them. Each remote vehicle within 60 m gets a kinematic box collider. Rendering is capped by draw distance.
- Upgrade path (README): move vehicle simulation to the server (Rapier in Node), switch clients to input sending + prediction/reconciliation (Colyseus 0.18 ships `Predict`/`Reconciler` helpers), keep the same message schemas.

## 6. Terrain

### 6.1 Data model

- Grid of vertices `(cellsX+1) × (cellsZ+1)`, 1 m spacing, split into chunks of 32×32 cells. Each chunk owns a `Float32Array(33×33)` of heights including its shared border (border vertices are written to every chunk that contains them), a matching bedrock array (static, derived from the map), `version`, `dirty`, and a dirty rect.
- **Quantization for determinism:** every stored height is an integer multiple of `Q = 1/1024 m`. Brush math works in integer quanta using only `+ − × ÷` and `Math.round`/`Math.floor`, iterating in a fixed row-major order. One quantum on a 1 m cell is `1/1024 m³`, so volumes are exact integers.
- Hard floor: per-vertex bedrock. Max height: per map.

### 6.2 `applyBrush(terrain, brush)`

`brush = { x, z, radius, depth, falloff, mode: "dig" | "fill" | "flatten", limitQ?, volumeQ?, targetQ? }` → `{ changedQ, rect }`.

- Weight: `t = 1 − d²/r²`, `w = (1 − falloff) + falloff × t²` inside the radius.
- `dig`: removes `round(depthQ × w)` per vertex, never below bedrock, stopping once `limitQ` (remaining bucket capacity) is reached. Returns removed quanta.
- `fill`: distributes exactly `volumeQ` by weight (floor shares + deterministic remainder), never above max height. Returns added quanta (≤ requested; the rest stays in the bucket/bed).
- `flatten`: lowers vertices above `targetQ`, uses the removed material to raise vertices below it (never adds net material). Returns the surplus removed quanta.
- After any brush: angle-of-repose relaxation on the dirty rect expanded by 2 cells, up to 8 passes, moving only material above bedrock between 4-neighbours whose height difference exceeds the material limit. Relaxation conserves volume exactly.

### 6.3 Mechanics (client detects, server decides)

- **Excavator / loader dig:** each frame the client computes the bucket tip (forward kinematics from the joints). If the tip is below the local terrain surface and the bucket is curling closed, it sends `dig` ops (≤ 10/s) at the tip. The server credits removed quanta to the player's `load`.
- **Release:** opening the bucket with `load > 0` sends `release` at the tip. The server checks whether the tip is inside any dump truck's bed bounds (from that truck's last validated pose and bed joint); if yes it transfers volume to the truck's `load` (capped at 12 m³), otherwise it applies a `fill` brush on the ground.
- **Dump truck:** bed above 40° with `load > 0` sends `dump` ops behind the truck; the server releases up to 2 m³/s as `fill` brushes and subtracts from `load`.
- **Bulldozer:** blade lowered and moving sends `push` ops with the blade center, blade bottom height and a windrow point ahead of the blade (the client computes positions, so the server needs no trig). The server applies `flatten` at the blade and `fill` with the surplus at the windrow point.
- `moved` counts quanta removed by dig/push plus quanta dumped by trucks.
- Visuals: a heap mesh in the bucket/bed scaled by `load / capacity`; dust bursts on dig and dump events (instanced, capped).

### 6.4 Op protocol

- The client sends intent with positions quantized to centimetres.
- The server validates: rate limit (10/s token bucket); the vehicle's tool kind matches the op; the op point is within the tool's `reach` of the vehicle's last validated position; radius and depth within the spec's brush limits; `release`/`dump` volumes come from the server's own `load` (the client never names a volume); `dig` requires remaining capacity; `dump` requires bed angle ≥ 40°; `push` requires blade height within the spec's range. Invalid ops are rejected with a structured log line and an `error` message.
- The server applies the op with the shared `applyBrush`, bumps chunk versions, and broadcasts the compact op with a monotonically increasing `seq` and the parameters it actually used (including `limitQ`/`volumeQ`), so every client reproduces the exact result.
- Clients queue incoming ops, apply them strictly in `seq` order, and on a gap send `terrainResync`. The server answers from its bounded op log (last 512 ops) or, if the gap is older, with a snapshot.
- Folding: every 256 ops or 30 s the server drops log entries older than the newest cached snapshot.

### 6.5 Snapshots and persistence

- Snapshot = header (format version, map id, material id, seq, chunk count) + for each chunk that differs from the base: chunk coords + `Int32` height deltas in quanta; the whole buffer is compressed with fflate `deflateSync`. Late joiners receive it in `welcome`, then apply buffered ops with `seq` greater than the snapshot's.
- Determinism test: replay one op log on two independent terrain instances and compare FNV-1a hashes of the quantized heights.
- `terrainPersistence` per table: `session` (default, terrain lives while the table lives) or `none` (terrain resets when the last driver leaves).
- "Keep table for later" (host toggle): the server saves the snapshot to `DATA_DIR/tables/<tableId>.bin` on dispose and every 60 s while it has changed. An index file stores owner user id, name, map, material, saved and expiry times. Limits: 1 MB per snapshot, 5 saved tables per user, 7-day expiry (sweep on boot and hourly). The cafe lists "Your saved tables"; reopening creates a new table that loads the snapshot (owner only). Store is behind an interface with an injectable clock and file system for tests.

### 6.6 Rendering and physics

- One mesh per chunk (`PlaneGeometry` 32×32 segments, heights written in place, normals recomputed for the dirty rect only) plus a 16×16 half-resolution geometry used beyond 60 m. At most 2 chunk geometry rebuilds per frame; the rest wait in a queue. Chunk-level frustum culling.
- Terrain material: `MeshStandardMaterial` with `onBeforeCompile` blending rock/dirt/sand by slope and height using the material preset colours; per-vertex attributes for "fresh dig" time (darkens, fades over ~20 s via a time uniform) and "track wear" (darkens, fades slowly; written only under wheels/tracks; at most 4,096 active wear vertices).
- Colliders: one Rapier heightfield collider per chunk. A dirty chunk rebuilds at most every 100 ms, at most 2 per frame. The new collider is created before the old one is removed in the same frame, so vehicles never fall through.
- Perf overlay (F3): fps, frame ms, chunk mesh rebuilds/s, collider rebuilds/s, worst collider rebuild ms, op queue length, terrain seq, draw calls.

## 7. Web client

### 7.1 Routes

| Route                     | Purpose                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                       | Landing: logo, tagline, Google sign-in (+ dev guest form).                                                                                    |
| `/cafe`                   | Lobby: illustrated cafe, chalkboard table browser, create table, join by code, saved tables, daily challenge banner, radio, profile (livery). |
| `/table/[roomId]`         | Game: client-only canvas (`dynamic(..., { ssr: false })`) + HUD. `?as=spectator` joins as spectator.                                          |
| `/api/auth/[...nextauth]` | Auth.js handlers.                                                                                                                             |
| `/api/game-token`         | Game JWT minting.                                                                                                                             |

### 7.2 GameLoop

One `GameLoop` with named, ordered phases; systems register with a phase and an optional order. A single R3F `useFrame` (render priority 1, so R3F's own render is disabled) calls `loop.tick(dt)`. Rapier runs with `<Physics paused>` and is stepped only in the `physics` phase. No other `useFrame` calls in game code.

```
inputs → player:pre-physics → vehicle:pre-physics → terrain:colliders → physics →
vehicle:post-physics → network:send → network:interpolate → terrain:apply →
camera → visuals → audio → render
```

- `inputs`: merge keyboard, gamepad and touch into one `InputState` (drive x/y, handbrake, tool axes 0–3, buttons).
- `player:pre-physics`: garage/respawn requests, battery drain, mode switches.
- `vehicle:pre-physics`: vehicle controllers (Rapier vehicle controller for wheeled, velocity-target differential drive for tracked), joint integration with limits, battery speed factor.
- `terrain:colliders`: throttled heightfield collider swaps.
- `physics`: Rapier step.
- `vehicle:post-physics`: read back poses, wheel/track visuals, tool tip, dig/release/dump/push detection, antenna spring, status LED.
- `network:send`: 20 Hz state messages, terrain op intents.
- `network:interpolate`: remote vehicle interpolation and kinematic collider targets.
- `terrain:apply`: apply queued server ops in seq order, mark chunks dirty.
- `camera`: operator / chase / free / spectate / photo.
- `visuals`: chunk mesh rebuilds, track wear, dust, nameplates, emote bubbles, day/night.
- `audio`: engine, servo, horn hooks.
- `render`: tilt-shift composer (three's `EffectComposer` + bundled tilt-shift shaders) or plain render.

Hot paths reuse preallocated `Vector3`/`Quaternion`/`Matrix4` scratch objects; no allocations per frame; every geometry/material/texture created imperatively is disposed on unmount.

### 7.3 Vehicles

- `VehicleModel` interface: `{ root, nodes: Partial<Record<NodeName, Object3D>>, setJoints(values), setLivery(livery), setLoad(fraction), setLed(state), dispose() }`. Four primitive-built models implement it now; a future `GlbVehicleModel` maps the same node names from a GLB.
- Wheeled: Rapier `DynamicRayCastVehicleController`. The loader approximates articulation by steering front and rear axles in opposite directions and bending the front frame visually.
- Tracked: dynamic box body; each step blends linear velocity toward the target forward speed and angular velocity toward the target turn rate, preserving vertical velocity.
- RC feel: soft suspension, antenna mesh on a damped spring driven by chassis acceleration, status LED (green ok, amber low battery, blinking while joints move), servo whine scaled by joint speed.
- Battery: drains with throttle and tool use over ~10 minutes of active driving; below 20% top speed scales down to 45%; parking within the charging station radius recharges it. Never stops the vehicle.

### 7.4 Controls (`controls.ts`)

| Action             | Keyboard                | Gamepad                            | Touch                                      |
| ------------------ | ----------------------- | ---------------------------------- | ------------------------------------------ |
| Drive / steer      | WASD, arrows            | left stick                         | transmitter left stick                     |
| Handbrake          | Space                   | A / Cross                          | button                                     |
| Tool axes 0–3      | Q/E, R/F, I/K, J/L      | right stick X/Y, triggers, bumpers | transmitter right stick + 2 rocker buttons |
| Horn               | H                       | Y / Triangle                       | button                                     |
| Garage             | G                       | Start                              | button                                     |
| Chat               | Enter                   | —                                  | button                                     |
| Player list        | Tab                     | Select                             | button                                     |
| Camera mode        | V                       | right stick click                  | button                                     |
| Emotes             | 1–5                     | d-pad                              | emote wheel button                         |
| Spectate prev/next | ← / → (spectators only) | LB / RB                            | swipe buttons                              |
| Photo mode         | P                       | —                                  | button                                     |
| Perf overlay       | F3                      | —                                  | —                                          |

The bottom HUD shows the current vehicle's tool labels (e.g. "R/F Boom up/down").

### 7.5 Cameras

- **Operator (default):** the operator stands at a spot on the table rim (`edgeT`). The spot drifts along the rim toward the point nearest the vehicle at walking pace; the camera sits at eye height above the rim, looks at the vehicle with smoothing lag, scroll zooms eye height/distance.
- **Chase:** behind and above the vehicle with lag.
- **Free orbit:** drei `OrbitControls`.
- **Spectate:** operator or chase view on the selected driver, ←/→ cycles.
- **Photo mode (P):** HUD hidden, free camera, "Save photo" renders a frame and composes a PNG with a project-dirtyworks frame and the table name.

### 7.6 Social features

- Nameplates (billboarded text, distance-faded) above vehicles; operator avatar chips (Google photo or initials) at each player's rim spot, visible to all.
- Emotes (1–5) as floating bubbles above the operator chip; horn also plays the honk.
- Player list (Tab): name, avatar, vehicle icon, ping, role; per-row Mute (client-side, persisted by user id) and Report; host gets Kick and Ban.
- Chat (Enter): last 50 messages, 200 chars, server-sanitized, rendered as text only; join/leave/host notices.
- Spectate mode and "Table is full — spectate or wait" prompt (wait watches the lobby listing and announces a free seat).
- Liveries: color + decal + number, chosen in the garage and profile, saved in localStorage, synced via `livery`.
- Daily challenge banner in the cafe and a small card in the HUD.
- Day/night toggle (host, shared).

### 7.7 HUD

Speed readout, vehicle name, battery gauge, bucket/bed fill gauge, "volume moved" counter, minimap (2D canvas: height shading redrawn at 2 Hz, player dots at 10 Hz), mini player list, ping, tool hints, RC transmitter (animated sticks and switches reflecting input; interactive on touch devices). HUD components read throttled zustand slices, never per-frame React renders.

### 7.8 Settings (persisted)

Quality Low/Medium/High (shadows on/off and map size, pixel ratio cap 1/1.5/2, particle cap, draw distance 80/140/220 m), tilt-shift on/off, sound volume, camera sensitivity.

### 7.9 Theme

- Tailwind v4 `@theme` tokens in CSS variables: coffee (dark brown surfaces), cream (text and cards), brick red (primary buttons), latte, chalkboard green-black, safety yellow `#F5C518` (vehicles and HUD only), hazard stripes for HUD borders.
- Fonts via `next/font/google`: Fredoka (UI), Saira Stencil One (logo only).
- Logo: SVG wordmark "project-dirtyworks" with an original excavator icon drawn from rects/circles/paths.
- Cafe: illustrated SVG/CSS scene (counter, shelf of RC vehicles, chalkboard, pendant lamps) that reflows on mobile; the chalkboard is the table browser with columns: table name, vibe tag, map, players/max, ping, lock icon, host.
- Copy: friendly, light dad-joke humor ("Another round of dirt?", "Careful, that was a perfectly good pile.").

## 8. Server internals

- `index.ts`: `Server` with `WebSocketTransport`, origin check on upgrade against `ALLOWED_ORIGINS`, CORS headers on HTTP routes, room definitions, HTTP routes, graceful shutdown (persists kept tables).
- `logger.ts`: structured JSON lines (`ts`, `level`, `msg`, `roomId`, `userId`, fields); level from `LOG_LEVEL`.
- `auth.ts`: `verifyGameToken`.
- `rooms/AuthedLobbyRoom.ts`, `rooms/TableRoom.ts` (thin: wiring and Colyseus hooks).
- `game/TableController.ts`: player lifecycle, roles, host succession, bans, moderation.
- `game/MovementGuard.ts`: per-player last valid pose + strike counter around `validateMovement`.
- `game/TerrainAuthority.ts`: authoritative terrain, op validation/apply, op log, snapshot cache, loads.
- `persistence/SnapshotStore.ts`.
- `http/routes.ts`: invite code lookup, saved tables.

## 9. Testing

Vitest in `packages/shared` and `apps/server`:

- Vehicle spec validation (all four valid, broken specs rejected), joint clamping.
- Movement validation: legal motion accepted; teleport, overspeed, impossible acceleration, out of bounds rejected; joints clamped.
- Terrain: dig/fill/flatten volume conservation, bedrock floor, max height clamp, falloff, angle-of-repose relaxation (slopes ≤ limit afterward, volume unchanged), hash-equal replay on two instances, snapshot round trip, chunk border consistency.
- Server: JWT verification (valid, expired, wrong secret, wrong audience, bad avatar host); table settings validation; table creation rules (limit of 3 per user); spectator join rules; livery validation; emote rate limiting; terrain op validation (legal dig accepted; out-of-reach, over-rate and impossible volume rejected); snapshot store save/load/size cap/expiry; room integration via `@colyseus/testing` (token required, password, full table, spectator, kick/ban, reconnection hold).
- End-to-end smoke (scratch script, not a project dependency): `playwright-core` driving installed Edge with two guest sessions: create table, join, drive, dig, dump into truck, chat, emote; third session joins late; compare terrain hashes exposed on `window.__dirtyworks`; fail on console errors.

## 10. Deployment (README)

- `apps/web` → Vercel (env: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `GAME_JWT_SECRET`, `NEXT_PUBLIC_GAME_SERVER_URL`).
- `apps/server` → Fly.io or Railway (long-running WebSockets do not work on Vercel serverless). Dockerfile (multi-stage, `node:24-alpine`, esbuild bundle). Env: `PORT`, `GAME_JWT_SECRET`, `ALLOWED_ORIGINS`, `DATA_DIR` (mounted volume), `LOG_LEVEL`.
- Google OAuth: authorized redirect URIs `http://localhost:3000/api/auth/callback/google` and `https://<web-domain>/api/auth/callback/google`.
- Run locally: copy `.env.example` to `apps/web/.env.local` and `apps/server/.env`, `npm install`, `npm run dev`; test with two browser profiles or one normal + one private window.

## 11. Milestones

1. **Frame:** monorepo, shared core (vehicles, maps, messages, movement, tables, livery, rate limits) with tests, server (auth, lobby, tables, validation, chat, moderation) with tests, web auth + token route, cafe + chalkboard browser, world + GameLoop + four vehicles + networking + HUD/chat/garage/settings.
2. **Terrain:** shared terrain + ops + snapshots with tests, server terrain authority with tests, client chunks/colliders/material, dig/release/dump/push, gauges, minimap, particles, perf overlay.
3. **Cafe life:** operator camera, RC transmitter, RC feel (suspension, antenna, LED, servo, battery), emotes, spectate, liveries, photo mode, material presets, track marks, saved tables, challenges, radio, README.

Each milestone ends with build, lint and tests green and a two-session smoke check.

## 12. Known risks

- Client-authoritative movement is cheatable within the validation tolerances.
- Terrain changes appear one round trip late (masked by instant local dust/sound).
- Single server process; scaling out needs Redis presence/driver and shared snapshot storage.
- Docker is not installed on the dev machine; the Dockerfile is written but not built locally.
- WebGL in headless Edge (for the smoke test) uses software rendering, so fps numbers from it are not representative.
