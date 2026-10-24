# project-dirtyworks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project-dirtyworks monorepo: Google-authenticated RC hobby cafe where players share miniature tables, drive four RC construction vehicles and dig/haul/push a shared deterministic terrain in real time.

**Architecture:** npm workspaces. `packages/shared` holds all pure game logic (vehicles, maps, terrain, ops, snapshots, validation, table rules) as TS source. `apps/server` is a Colyseus 0.18 server that verifies game JWTs, validates every message with zod, owns the authoritative terrain and broadcasts sequenced ops. `apps/web` is Next.js 16 + Auth.js v5 + R3F/Rapier with one ordered `GameLoop`.

**Tech Stack:** Node 24, TypeScript 6.0, Next.js 16, React 19.3, Tailwind 4, next-auth 5 beta, three 0.186, @react-three/fiber 9, drei 10, @react-three/rapier 2, zustand 5, Colyseus 0.18 (`@colyseus/core`, `@colyseus/ws-transport`, `@colyseus/schema` 5, `@colyseus/sdk`), zod 4, fflate, jose, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-24-project-dirtyworks-design.md`

## Global Constraints

- Package names: `project-dirtyworks` (root), `@dirtyworks/shared`, `@dirtyworks/server`, `@dirtyworks/web`. UI says "table", never "room/server".
- `engines.node`: `>=22.12`. TypeScript `~6.0`, `strict: true` everywhere.
- Shared modules import nothing from three, rapier, React, DOM or Node built-ins.
- Runtime deps limited to the spec §3 list; anything else needs a one-line justification in the README.
- Terrain heights are integer multiples of `1/1024 m`; terrain math uses only `+ − × ÷`, `Math.round`, `Math.floor`, `Math.sqrt`, fixed row-major iteration.
- No per-frame allocations in game loop systems; dispose every imperatively created geometry/material/texture on unmount.
- Exactly one `useFrame` in game code (the loop driver).
- Never send or render email addresses. Avatars only from `https://*.googleusercontent.com`, initials fallback.
- Limits: drivers 2–8, spectators ≤ 8, 3 live tables per user, chat 200 chars / last 50 / 1 msg/s burst 3, emotes 1 per 2 s burst 3, terrain ops 10/s, state 25/s, reconnection hold 20 s, game token TTL 300 s, saved tables 1 MB / 5 per user / 7 days.
- Colors: safety yellow `#F5C518` for vehicles/HUD only; cafe UI uses coffee/cream/brick tokens. Fonts: Fredoka (UI), Saira Stencil One (logo only).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Late joiner arrives while ops are in flight: ops with `seq <= snapshot.seq` must be dropped and later ones applied in order (TerrainSync test, Task 18).
2. A player reconnects within 20 s: same seat, same vehicle, load preserved; after 20 s the seat is freed and the host passes on (room integration test, Task 9).
3. The host leaves a table with a spectator and a driver left: the earliest-joined connected player becomes host, spectator included (`nextHost` test, Task 3).
4. Bucket release over a truck that is full: only the remaining bed capacity transfers, the rest goes to the ground as fill (TerrainAuthority test, Task 16).
5. Malformed or hostile payloads (NaN, Infinity, huge strings, unknown vehicle) are dropped without crashing the room (validation tests, Tasks 4 and 9).

---

## Milestone 1 — Frame

### Task 1: Monorepo scaffold

**Files:**

- Create: `package.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.gitignore`, `.editorconfig`, `.env.example`, `.nvmrc`
- Create: `packages/shared/{package.json,tsconfig.json,vitest.config.ts,src/index.ts}`
- Create: `apps/server/{package.json,tsconfig.json,vitest.config.ts,build.mjs,src/index.ts}`
- Create: `apps/web` via `create-next-app` equivalent files (`package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `src/app/{layout.tsx,page.tsx,globals.css}`)

**Interfaces:**

- Produces: root scripts `dev`, `build`, `test`, `lint`, `typecheck`, `format`; `@dirtyworks/shared` exports `"."` → `./src/index.ts`.

- [ ] Step 1: Write root `package.json` (workspaces `apps/*`, `packages/*`; `dev` = `concurrently -n web,server "npm:dev -w @dirtyworks/web" "npm:dev -w @dirtyworks/server"`; `build`/`test`/`typecheck` = `npm run <x> --workspaces --if-present`; `lint` = `eslint .`).
- [ ] Step 2: Write workspace package.json files and tsconfigs extending `tsconfig.base.json`.
- [ ] Step 3: `npm install` all deps at pinned majors from the spec.
- [ ] Step 4: Add a trivial shared test (`index.test.ts` asserting `PROJECT_NAME === "project-dirtyworks"`), run `npm test`, `npm run build`, `npm run lint`. Expected: all pass.
- [ ] Step 5: Commit `chore: scaffold monorepo`.

### Task 2: Shared vehicles, math, constants

**Files:** Create `packages/shared/src/{constants.ts,math.ts,vehicles.ts}`, Test `packages/shared/test/vehicles.test.ts`

**Interfaces — Produces:**

- `type VehicleId = "excavator" | "dump-truck" | "bulldozer" | "wheel-loader"`; `VEHICLE_IDS`.
- `type ToolAxis = 0 | 1 | 2 | 3`; `JointSpec { id; label; node; kind: "rot" | "slide"; axis: "x" | "y" | "z"; min; max; speed; rest; input: ToolAxis; hints: [string, string] }`.
- `VehicleSpec { id; displayName; blurb; drive: "wheeled" | "tracked"; articulated: boolean; mass; chassis: { size: Vec3; comOffset: Vec3 }; wheels?: WheelSpec[]; tracks?: { width; length; gauge }; maxSpeed; maxAccel; steer: { maxAngle?: number; turnRate?: number }; suspension: { stiffness; damping; travel }; joints: JointSpec[]; rig: ToolRig; tool: ToolSpec; antenna: Vec3 }`.
- `ToolRig { base: Vec3; swing?: string; chain: { joint: string; length: number; offset: number }[] }` (planar chain in forward(+Z)/up(+Y) plane, after optional swing yaw).
- `ToolSpec { kind: "bucket" | "bed" | "blade"; capacityM3; reach; brushRadius; maxDigDepth; dumpAngle?; bedBox?: { center: Vec3; size: Vec3 }; blade?: { width; maxDepth } }`.
- `VEHICLES: Record<VehicleId, VehicleSpec>`, `vehicleSpecSchema`, `validateVehicleSpec(x: unknown): { ok: true; spec: VehicleSpec } | { ok: false; errors: string[] }`, `restJoints(spec): number[]`, `clampJoints(spec, values: ArrayLike<number>, out: number[]): number[]`, `toolTipLocal(spec, joints, out: Vec3): Vec3`, `toolTipWorld(spec, pose: Pose, joints, out: Vec3): Vec3`.
- Conventions: vehicle forward = +Z, up = +Y, positive yaw turns left (toward +X).

- [ ] Step 1: Tests: `all four built-in specs validate`; `rejects min >= max`, `rejects rest outside limits`, `rejects wheeled spec without wheels`, `rejects duplicate joint ids`; `clampJoints clamps each joint to [min,max] and replaces NaN with rest`; `excavator tip moves forward when boom lowers`; `toolTipWorld applies pose translation and yaw`; capacities: excavator 1.2, dump truck 12, loader 2.5; dump truck `dumpAngle` = 40° in radians.
- [ ] Step 2: Run `npm test -w @dirtyworks/shared` → FAIL (missing module).
- [ ] Step 3: Implement. Key values: excavator joints swing(Q/E,axis 0, ±π), boom(R/F, axis 1, −0.6..1.1 rad), stick(I/K, axis 2, −2.4..−0.4), bucket(J/L, axis 3, −2.2..0.6), reach 9 m; dump truck bed(R/F, 0..0.95 rad); bulldozer blade height (slide, R/F, −0.4..1.0 m) and blade tilt (I/K, ±0.25 rad), reach 4 m, maxDepth 0.4; loader arm (R/F, −0.35..1.25 rad), tilt (I/K, −0.9..0.9), reach 5 m.
- [ ] Step 4: Run tests → PASS.
- [ ] Step 5: Commit `feat(shared): vehicle specs, joint limits, tool kinematics`.

### Task 3: Shared tables, livery, emotes, chat, rate limit, challenges, auth claims, battery

**Files:** Create `packages/shared/src/{rateLimit.ts,tables.ts,livery.ts,emotes.ts,chat.ts,challenges.ts,auth.ts,battery.ts}`; Tests `packages/shared/test/{rateLimit,tables,livery,emotes,chat,challenges,auth,battery}.test.ts`

**Interfaces — Produces:**

- `class TokenBucket { constructor(capacity: number, refillPerSec: number, now?: () => number); take(n?: number): boolean; readonly tokens: number }`.
- `tableSettingsSchema` (zod) → `TableSettings { name; mapId; vibe: Vibe; rule: TableRule; maxPlayers; visibility: "public" | "private"; password?; materialId?; terrainPersistence: "session" | "none"; keepForLater: boolean; restoreId? }`.
- `canCreateTable(liveTablesForUser: number): Result<"TABLE_LIMIT">`, `canJoinAs(role: Role, counts: { drivers; spectators }, maxPlayers: number): Result<"TABLE_FULL" | "SPECTATORS_FULL">`, `nextHost(players: HostCandidate[], leavingSessionId: string): string | null`, `makeInviteCode(rand?: () => number): string`, `isInviteCode(s): boolean`, `TableListing` type.
- `LIVERY_COLORS`, `DECALS`, `liverySchema`, `DEFAULT_LIVERY`, `type Livery`.
- `EMOTES`, `type EmoteId`, `EMOTE_RATE = { capacity: 3, refillPerSec: 0.5 }`, `emoteForKey(key: string)`.
- `sanitizeChat(raw: string): string | null`, `setProfanityFilter(fn)`, `filterProfanity(text)`.
- `CHALLENGES` (7), `challengeForDate(d: Date): Challenge`, `challengeDateKey(d): string`.
- `gameTokenClaimsSchema`, `GameUser { id; name; avatar: string | null }`, `isAllowedAvatarUrl(url): boolean`, `GAME_TOKEN_ISSUER`, `GAME_TOKEN_AUDIENCE`.
- `BATTERY`, `drainBattery(level, throttle, tool, dt)`, `chargeBattery(level, dt)`, `batterySpeedFactor(level)`.

- [ ] Step 1: Tests: settings accept a valid table, reject maxPlayers 1 and 9, reject 1-char name, reject unknown map, default `terrainPersistence = "session"`; `canCreateTable(3)` → `TABLE_LIMIT`; `canJoinAs("driver", {drivers: 8}, 8)` → `TABLE_FULL` while `"spectator"` → ok; spectators 8 → `SPECTATORS_FULL`; `nextHost` picks earliest-joined connected player including spectators, null when alone; invite codes are 6 chars from the unambiguous alphabet; livery accepts allowed color/decal, rejects `#ff0000`, unknown decal, number 100; emote limiter allows 3 then blocks, allows again after 2 s (fake clock); `sanitizeChat` trims, strips control and bidi chars, cuts to 200, returns null for whitespace; `challengeForDate` rotates through all 7 on consecutive UTC days; avatar allowlist accepts `https://lh3.googleusercontent.com/a/x`, rejects `http://` and `https://evil.com/googleusercontent.com`; battery factor 1 at ≥ 0.2 and 0.45 at 0.
- [ ] Step 2: Run → FAIL. Step 3: Implement. Step 4: Run → PASS.
- [ ] Step 5: Commit `feat(shared): table rules, livery, emotes, chat, rate limits`.

### Task 4: Shared maps, materials, movement validation, messages

**Files:** Create `packages/shared/src/{maps.ts,materials.ts,movement.ts,messages.ts}`; Tests `packages/shared/test/{maps,movement,messages}.test.ts`

**Interfaces — Produces:**

- `MapId`, `MAP_IDS`, `TableMap` (spec §4.2; world centered: vertex `(i, j)` at `x = i − cellsX/2`, `z = j − cellsZ/2`), `MAPS`, `mapBounds(map): Bounds { minX; maxX; minZ; maxZ; minY; maxY }`, `rimPoint(map, edgeT, out): Vec3`, `nearestEdgeT(map, x, z): number`.
- `MaterialId`, `MATERIALS: Record<MaterialId, MaterialPreset { id; displayName; reposeDeg; reposeQ; colors: { rock; dirt; sand }; particleColor; softness }>` with `reposeQ` 591 (sand), 800 (gravel), 1024 (damp dirt).
- `Pose { x; y; z; qx; qy; qz; qw; vx; vy; vz }`, `validateMovement(prev: Pose, next: Pose, spec: VehicleSpec, bounds: Bounds, dtSec: number): { ok: true } | { ok: false; reason: "nan" | "bounds" | "overspeed" | "teleport" | "accel" }`.
- `MSG` constant object of message names; zod schemas `stateMsgSchema`, `spawnMsgSchema`, `chatMsgSchema`, `emoteMsgSchema`, `liveryMsgSchema`, `reportMsgSchema`, `targetMsgSchema`, `dayNightMsgSchema`, `keepMsgSchema`, `pongMsgSchema`, `terrainResyncSchema`; S2C payload types `Welcome`, `ChatEntry`, `NoticeEvent`, `EmoteEvent`, `Correction`, `ErrorEvent`.

- [ ] Step 1: Tests: every map size is a multiple of 32, spawn points and props inside bounds, mini-quarry 128, others 96; `rimPoint(0)` and `rimPoint(1)` coincide; `nearestEdgeT(rimPoint(t)) ≈ t`; movement accepts 10 m/s drive for 0.05 s; rejects 40 m jump (teleport), 3× maxSpeed (overspeed), velocity jump 0→20 m/s in 0.05 s (accel), x outside bounds, NaN; accepts 9.8 m/s² fall; state schema rejects `Infinity`, joints arrays longer than 4, unknown vehicle.
- [ ] Step 2–4: FAIL → implement (spec §5.3 constants) → PASS.
- [ ] Step 5: Commit `feat(shared): maps, materials, movement validation, message schemas`.

### Task 5: Server foundation — config, logger, auth, password, registry

**Files:** Create `apps/server/src/{config.ts,logger.ts,auth.ts}`, `apps/server/src/game/{password.ts,tableRegistry.ts}`; Tests `apps/server/test/{auth,password,tableRegistry}.test.ts`

**Interfaces — Produces:**

- `loadConfig(env): ServerConfig { port; jwtSecret; allowedOrigins: string[]; dataDir; logLevel }` (secret ≥ 32 chars).
- `createLogger(level, bindings?): Logger { debug; info; warn; error; child(bindings) }` — JSON lines to stdout.
- `verifyGameToken(token: string, secret: string): Promise<GameUser>` throws `AuthError(code: "missing" | "invalid" | "expired")`; checks issuer, audience, alg HS256, claims schema, drops disallowed avatar.
- `hashPassword(pw): Promise<string>`, `verifyPassword(pw, hash): Promise<boolean>` (scrypt + timingSafeEqual).
- `TableRegistry { add(roomId, userId, inviteCode); remove(roomId); countFor(userId): number; roomForCode(code): string | null }`.

- [ ] Step 1: Tests: valid token → user; expired (exp in past) → `expired`; wrong secret → `invalid`; wrong audience → `invalid`; avatar `https://evil.example/x.png` → `avatar: null`; password round trip and wrong password false; registry counts per user and resolves codes case-insensitively.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Commit `feat(server): config, logging, token verification`.

### Task 6: Server rooms — schema, lobby, TableRoom core

**Files:** Create `apps/server/src/rooms/{schema.ts,AuthedLobbyRoom.ts,TableRoom.ts}`, `apps/server/src/game/MovementGuard.ts`, `apps/server/src/server.ts`, `apps/server/src/http/routes.ts`; Modify `apps/server/src/index.ts`; Test `apps/server/test/tableRoom.test.ts`, `apps/server/test/movementGuard.test.ts`

**Interfaces:**

- Consumes: Tasks 2–5.
- Produces: `createGameServer(config, deps: { logger; store?: SnapshotStore }): Server`; room names `"lobby"`, `"table"`; `TableState`/`PlayerState` schema (spec §5.2); join options `{ role: Role; password?: string; vehicle?: VehicleId; livery?: Livery; settings?: TableSettings (create only) }`; error codes thrown from onAuth/onCreate: `UNAUTHORIZED`, `TABLE_LIMIT`, `BAD_SETTINGS`, `BAD_PASSWORD`, `BANNED`, `TABLE_FULL`, `SPECTATORS_FULL`.
- `MovementGuard { constructor(spec, bounds); reset(pose, nowMs); accept(next: Pose, nowMs): { ok: true } | { ok: false; correction: Pose | null } }` — correction after 3 consecutive failures.

- [ ] Step 1: Tests (using `@colyseus/testing` boot with `createGameServer`): join without token rejected; create with valid token returns listing metadata (`name`, `mapId`, `hostName`, `locked: false`); a 4th create by the same user rejected with `TABLE_LIMIT`; locked table rejects wrong password and accepts right one; 3rd driver at a 2-player table gets `TABLE_FULL`, spectator joins; `state` message with a legal move updates player pose; teleport ×3 yields `correction`; chat is sanitized and broadcast, 4 quick chats → 3 delivered; host `kick` removes target, `ban` prevents rejoin; when host leaves the next player becomes host; dropping a client keeps its seat (`connected=false`) and reconnect restores it; room disposes when empty. MovementGuard unit tests for strike counter.
- [ ] Step 2–4: FAIL → implement → PASS. Message handlers use Colyseus 0.18 `messages = { name: validate(schema, handler) }` plus per-client `TokenBucket`s; zod failures counted, 20 in 10 s → `client.leave()`.
- [ ] Step 5: Commit `feat(server): lobby and table rooms with auth, validation, moderation`.

### Task 7: Web auth and token route

**Files:** Create `apps/web/src/auth.ts`, `apps/web/src/proxy.ts`, `apps/web/src/app/api/auth/[...nextauth]/route.ts`, `apps/web/src/app/api/game-token/route.ts`, `apps/web/src/lib/gameToken.ts`, `apps/web/src/lib/env.ts`; Test `apps/web/test/gameToken.test.ts`

**Interfaces — Produces:**

- `mintGameToken(user: GameUser, secret: string, nowSec?: number): Promise<string>` (HS256, iss/aud from shared, exp now+300).
- `auth()`, `signIn`, `signOut`, `handlers` from Auth.js; `devLoginEnabled(): boolean`.
- `GET /api/game-token` → `{ token, user: GameUser }` or 401.
- Session shape: `session.user = { id, name, image }` (no email).

- [ ] Step 1: Test: minted token verifies with jose using shared issuer/audience and expires in 300 s; disallowed avatar omitted.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Commit `feat(web): Auth.js Google + dev guest login, game token route`.

### Task 8: Web shell — theme, landing, cafe chalkboard browser

**Files:** Create `apps/web/src/app/globals.css` (tokens), `apps/web/src/app/{layout.tsx,page.tsx}`, `apps/web/src/app/cafe/page.tsx`, `apps/web/src/ui/common/{Logo.tsx,Avatar.tsx,Button.tsx,Dialog.tsx,Field.tsx}`, `apps/web/src/ui/cafe/{CafeScene.tsx,Chalkboard.tsx,CreateTableDialog.tsx,JoinByCodeDialog.tsx,PasswordDialog.tsx,ProfileDialog.tsx,ChallengeBanner.tsx,Radio.tsx,SavedTables.tsx}`, `apps/web/src/net/{gameClient.ts,useLobby.ts,pendingRoom.ts}`, `apps/web/src/state/profileStore.ts`

**Interfaces — Produces:**

- `getGameClient(): Promise<Client>` (sets `client.auth.token` from `/api/game-token`, refreshes when < 60 s left).
- `useLobby(): { tables: TableRow[]; status; ping }`.
- `pendingRoom.set(room)` / `take(roomId)` hand-off of an already-joined room to `/table/[roomId]`.
- `useProfile` zustand store (persisted): `livery`, `muted: string[]`, `challengeDone: string[]`, `radio`.

- [ ] Step 1: Build pages; verify by `npm run build -w @dirtyworks/web` and a manual dev run: landing renders, guest sign in reaches `/cafe`, chalkboard lists a table created from another session.
- [ ] Step 2: Commit `feat(web): cafe lobby with chalkboard table browser`.

### Task 9: Game loop, world, local driving (dump truck first)

**Files:** Create `apps/web/src/game/loop/{GameLoop.ts,LoopDriver.tsx}`, `apps/web/src/game/{Game.tsx,runtime.ts}`, `apps/web/src/game/input/{controls.ts,InputSystem.ts,touchInput.ts}`, `apps/web/src/game/world/{World.tsx,Tabletop.tsx,Props.tsx,Lighting.tsx,Backdrop.tsx}`, `apps/web/src/game/vehicles/models/{VehicleModel.ts,parts.ts,DumpTruckModel.ts,index.ts}`, `apps/web/src/game/vehicles/{WheeledController.ts,ToolRig.ts,LocalVehicle.tsx}`, `apps/web/src/game/camera/CameraRig.ts`, `apps/web/src/app/table/[roomId]/{page.tsx,TableClient.tsx}`, `apps/web/src/state/{settingsStore.ts,uiStore.ts,hudStore.ts}`; Test `apps/web/test/gameLoop.test.ts`, `apps/web/test/controls.test.ts`

**Interfaces — Produces:**

- `PHASES = ["inputs","player:pre-physics","vehicle:pre-physics","terrain:colliders","physics","vehicle:post-physics","network:send","network:interpolate","terrain:apply","camera","visuals","audio","render"] as const`; `class GameLoop { register(phase, system: { name; update(ctx: FrameContext): void }, order?: number): () => void; tick(dt: number): void; readonly stats }`; `FrameContext { dt; time; frame }`.
- `InputState { drive: { x; y }; handbrake; tool: [n,n,n,n]; pressed: Set<Action> (edge-triggered this frame) }`; `BINDINGS: Record<Action, KeyBinding[]>`; `toolAxisKeys(axis): [string, string]`.
- `VehicleModel` (spec §7.3) + `createVehicleModel(id, livery): VehicleModel`.
- `runtime` singleton: `{ loop, input, terrain?, local?, remotes, net? }`.

- [ ] Step 1: Tests: systems run in phase order regardless of registration order; unregister removes; `order` sorts within a phase; every action has a binding and no key is bound twice outside the spectator-only group.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Manual check: drive the dump truck on the Mini Quarry flat heightfield; raise/lower bed with R/F.
- [ ] Step 6: Commit `feat(web): ordered game loop, world, drivable dump truck`.

### Task 10: Remaining vehicles

**Files:** Create `apps/web/src/game/vehicles/models/{ExcavatorModel.ts,BulldozerModel.ts,WheelLoaderModel.ts}`, `apps/web/src/game/vehicles/TrackedController.ts`; Modify `models/index.ts`, `LocalVehicle.tsx`

- [ ] Step 1: Implement; tool tip from models matches `toolTipLocal` (dev assertion).
- [ ] Step 2: Manual check each vehicle drives and every joint moves within limits; `npm run build`.
- [ ] Step 3: Commit `feat(web): excavator, bulldozer, wheel loader`.

### Task 11: Networking client — table session, state send, interpolation, remote colliders

**Files:** Create `apps/web/src/net/{tableSession.ts,InterpBuffer.ts,clock.ts}`, `apps/web/src/game/vehicles/RemoteVehicles.tsx`, `apps/web/src/state/sessionStore.ts`; Test `apps/web/test/interpBuffer.test.ts`

**Interfaces — Produces:**

- `joinTable(roomId, opts) / createTable(settings) / reconnectTable(token)` → `TableSession { room; sessionId; send(type, payload); leave(); on(event, cb) }`.
- `class InterpBuffer { push(tServer: number, pose: Pose, joints: ArrayLike<number>): void; sample(tRender: number, outPose: Pose, outJoints: number[]): boolean }` (ring buffer, 32 samples, slerp).
- `ServerClock { observe(serverMs, localMs); toServer(localMs) }`.

- [ ] Step 1: Tests: buffer interpolates midpoint, clamps before first/after last sample, slerps through shortest path, no allocations on `sample` (same output object).
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Manual two-session check: both see each other move smoothly and collide.
- [ ] Step 6: Commit `feat(web): table networking, interpolation, remote colliders`.

### Task 12: In-table UI — HUD, chat, player list, garage, settings, notices

**Files:** Create `apps/web/src/ui/hud/{Hud.tsx,SpeedReadout.tsx,ToolHints.tsx,PingBadge.tsx,MiniPlayerList.tsx,ChatPanel.tsx,PlayerList.tsx,Garage.tsx,VehiclePreview.tsx,SettingsDialog.tsx,Toasts.tsx,TableMenu.tsx}`

- [ ] Step 1: Implement; garage preview is a small separate R3F `<Canvas>` with its own auto-rotate (outside the game loop, documented exception).
- [ ] Step 2: Manual check: Enter chat, Tab list, G garage respawn, settings persisted across reload, host kick/close.
- [ ] Step 3: `npm run build && npm run lint && npm test` → PASS. Commit `feat(web): HUD, chat, player list, garage, settings`.

## Milestone 2 — Terrain

### Task 13: Shared terrain core

**Files:** Create `packages/shared/src/terrain.ts`; Test `packages/shared/test/terrain.test.ts`

**Interfaces — Produces:**

- `HEIGHT_Q_PER_M = 1024`, `CHUNK_CELLS = 32`, `CHUNK_VERTS = 33`, `toQ(m)`, `fromQ(q)`, `quantaToM3(q)`, `m3ToQuanta(m3)`.
- `VertexRect { i0; j0; i1; j1 }` (inclusive, global vertex coords).
- `class Terrain { cellsX; cellsZ; chunksX; chunksZ; maxQ; chunks: TerrainChunk[]; getQ(i,j); setQ(i,j,q); bedrockQ(i,j); heightAt(x,z); vertexOf(x): number; markDirty(rect); takeDirtyChunks(out: TerrainChunk[]): number; hash(): number; clone(): Terrain; copyFrom(t) }`, `TerrainChunk { cx; cz; heights: Float32Array; bedrock: Float32Array; version; dirty; dirtyRect: VertexRect | null }`.
- `createTerrainForMap(map: TableMap): Terrain` (deterministic base + bedrock).
- `applyBrush(t: Terrain, b: Brush): { changedQ: number; rect: VertexRect | null }` with `Brush { x; z; radius; falloff; mode: "dig" | "fill" | "flatten"; depthQ?; limitQ?; volumeQ?; targetQ? }`.
- `relaxRepose(t, rect, reposeQ, maxPasses = 8): number`.

- [ ] Step 1: Tests: chunk border vertices equal across neighbours after edits on the border; dig returns exactly the sum of height decreases (in quanta); fill adds exactly `volumeQ` on open ground; dig stops at bedrock and `limitQ`; fill stops at `maxQ`; flatten never adds net material and returns surplus; relax leaves no 4-neighbour difference above `reposeQ` within the rect (where material is loose) and conserves the sum; relax does not move material below bedrock; `heightAt` interpolates bilinearly; base terrain identical between two `createTerrainForMap` calls (equal hashes).
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Commit `feat(shared): chunked deterministic terrain with brushes and repose`.

### Task 14: Shared terrain ops and snapshots

**Files:** Create `packages/shared/src/{terrainOps.ts,snapshot.ts}`; Tests `packages/shared/test/{terrainOps,replay,snapshot}.test.ts`

**Interfaces — Produces:**

- `terrainIntentSchema` (discriminated union, cm integers): `dig { x, z, r, d }`, `release { x, z }`, `dump { x, z }`, `push { x, z, r, h, fx, fz }`.
- `OP = { DIG: 1, FILL: 2, PUSH: 3 }`, `AppliedOp { seq; code; by; x; z; r; a; b; c; d; resultQ }` where per code: DIG `a = depthQ, b = limitQ`; FILL `a = volumeQ`; PUSH `a = targetQ, b = fx, c = fz`.
- `encodeOp(op): WireOp` (`number|string` tuple), `decodeOp(w): AppliedOp`, `applyTerrainOp(t, op, material): number` (brush + repose; returns resultQ).
- `encodeSnapshot(t, base, meta: { mapId; materialId; seq }): Uint8Array`, `decodeSnapshot(bytes): TerrainSnapshot`, `applySnapshot(t, snap): void`.

- [ ] Step 1: Tests: replay of a 500-op seeded log on two `createTerrainForMap` instances yields equal hashes and equal resultQ per op; a different op order yields a different hash; wire encode/decode round trip; snapshot round trip restores identical hash; unchanged terrain snapshot has 0 chunks; snapshot of mini-quarry after 200 digs < 64 KB; decode rejects bad magic.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Commit `feat(shared): terrain op protocol and compressed snapshots`.

### Task 15: Server terrain validation

**Files:** Create `apps/server/src/game/terrainValidation.ts`; Test `apps/server/test/terrainValidation.test.ts`

**Interfaces — Produces:**

- `validateIntent(intent: TerrainIntent, ctx: IntentContext): { ok: true } | { ok: false; reason: "rate" | "tool" | "reach" | "radius" | "depth" | "volume" | "angle" | "blade" | "no-vehicle" }`, `IntentContext { spec: VehicleSpec | null; pose: Pose | null; joints: ArrayLike<number>; loadQ: number; bucket: TokenBucket }`.

- [ ] Step 1: Tests: legal excavator dig at 6 m accepted; dig at 15 m rejected `reach`; 11th op inside one second rejected `rate`; dig with full bucket rejected `volume`; release with empty bucket rejected `volume`; dump truck dump with bed at 20° rejected `angle`; dig from a dump truck rejected `tool`; radius beyond spec rejected `radius`; bulldozer push with blade 2 m below vehicle rejected `blade`.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Commit `feat(server): terrain op validation`.

### Task 16: Server TerrainAuthority, snapshot store, room wiring

**Files:** Create `apps/server/src/game/TerrainAuthority.ts`, `apps/server/src/persistence/SnapshotStore.ts`; Modify `TableRoom.ts`, `http/routes.ts`; Tests `apps/server/test/{terrainAuthority,snapshotStore}.test.ts`, extend `tableRoom.test.ts`

**Interfaces — Produces:**

- `TerrainAuthority { constructor(map, material, opts: { logSize: 512 }); readonly seq; handle(intent, actor: Actor, trucks: TruckInfo[]): { ok: true; ops: AppliedOp[]; transfers: Transfer[] } | { ok: false; reason }; snapshot(): Uint8Array; opsSince(seq): AppliedOp[] | null; reset(): AppliedOp[]; restore(bytes) }`.
- `SnapshotStore { save(meta: SavedTableMeta, bytes): Promise<Result<"TOO_LARGE" | "USER_LIMIT">>; load(tableId, userId): Promise<Uint8Array | null>; list(userId): Promise<SavedTableMeta[]>; remove(tableId, userId): Promise<boolean>; sweep(): Promise<number> }`, `createFileSnapshotStore(dir, now?)`, `createMemorySnapshotStore(now?)`.

- [ ] Step 1: Tests: dig credits removed quanta to actor load; release over a truck bed transfers to truck load capped at capacity, remainder filled on ground (Review Focus 4); dump subtracts load and emits FILL; seq strictly increases; `opsSince` returns null once folded; store rejects > 1 MB, 6th save per user, expires after 7 days (fake clock), `sweep` deletes expired; room test: late joiner's `welcome` snapshot + subsequent ops gives the same hash as the server; `terrainReset` (host only) resets.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Commit `feat(server): authoritative terrain, op log, saved tables`.

### Task 17: Client terrain rendering and colliders

**Files:** Create `apps/web/src/game/terrain/{TerrainView.tsx,ChunkMeshes.ts,ChunkColliders.ts,terrainMaterial.ts}`; Modify `World.tsx`

**Interfaces — Produces:** `ChunkMeshes { constructor(terrain, material, scene); update(camera, budget = 2): number; dispose() }`, `ChunkColliders { constructor(world, rapier, terrain); update(nowMs, budget = 2): { rebuilt; worstMs }; dispose() }`, `createTerrainMaterial(preset, palette): { material; uniforms: { uTime } }`.

- [ ] Step 1: Implement; verify heightfield orientation with a dev raycast check (ray down at 5 sample points equals `terrain.heightAt` ± 0.05 m).
- [ ] Step 2: Manual check; commit `feat(web): chunked terrain meshes, LOD and throttled colliders`.

### Task 18: Client terrain sync, digging mechanics, load visuals, particles, HUD gauges, minimap, perf overlay

**Files:** Create `apps/web/src/net/TerrainSync.ts`, `apps/web/src/game/vehicles/ToolInteraction.ts`, `apps/web/src/game/fx/{Dust.ts,LoadHeap.ts}`, `apps/web/src/ui/hud/{LoadGauge.tsx,VolumeCounter.tsx,Minimap.tsx,PerfOverlay.tsx}`; Test `apps/web/test/terrainSync.test.ts`

**Interfaces — Produces:** `TerrainSync { constructor(terrain, material, send); loadSnapshot(bytes, seq); receive(wire); flush(budget): number; readonly queueLength; readonly seq; onGap }`.

- [ ] Step 1: Tests (Review Focus 1): ops with `seq <= snapshotSeq` dropped; out-of-order ops buffered and applied in order; a gap older than 2 s triggers `terrainResync` once.
- [ ] Step 2–4: FAIL → implement → PASS.
- [ ] Step 5: Manual: excavator digs into bucket, releases into truck, truck dumps a pile, bulldozer pushes, loader scoops; gauges update; F3 overlay shows counters.
- [ ] Step 6: Commit `feat(web): terrain sync and dig/haul/push mechanics`.

## Milestone 3 — Cafe life

### Task 19: Operator camera, RC transmitter, RC feel, battery and charging station, audio hooks

**Files:** Modify `CameraRig.ts`; Create `apps/web/src/ui/hud/Transmitter.tsx`, `apps/web/src/game/vehicles/RcFeel.ts` (antenna spring, LED, servo), `apps/web/src/game/audio/sound.ts`, `apps/web/src/game/render/Composer.ts`

- [ ] Step 1: Implement; transmitter reads input state via a throttled store (15 Hz); touch sticks write to `touchInput`.
- [ ] Step 2: Manual check on desktop and in device emulation; commit `feat(web): operator camera, RC transmitter, RC feel, tilt-shift`.

### Task 20: Emotes, operator chips, nameplates, spectate, table-full prompt, photo mode, liveries

**Files:** Create `apps/web/src/game/fx/{OperatorChips.tsx,Nameplates.tsx}`, `apps/web/src/ui/hud/{EmoteBar.tsx,SpectateBar.tsx,PhotoMode.tsx,TableFullDialog.tsx}`; Modify `Garage.tsx`, `ProfileDialog.tsx`, server `TableRoom.ts` (emote, livery, report handlers); Test extend `apps/server/test/tableRoom.test.ts` (emote rate limit through the room, livery rejection, spectator cannot spawn or send terrain ops)

- [ ] Step 1–4: tests FAIL → implement → PASS.
- [ ] Step 5: Commit `feat: emotes, spectate, photo mode, liveries`.

### Task 21: Material presets in rendering, track marks, saved tables UI, challenges, radio

**Files:** Create `apps/web/src/game/terrain/TrackWear.ts`; Modify `terrainMaterial.ts`, `Dust.ts`, `SavedTables.tsx`, `ChallengeBanner.tsx`, `Radio.tsx`

- [ ] Step 1: Implement; wear capped at 4,096 active vertices.
- [ ] Step 2: Commit `feat(web): material presets, track marks, saved tables, challenges`.

### Task 22: README, Dockerfile, end-to-end smoke, fixes

**Files:** Create `README.md`, `apps/server/Dockerfile`, `.dockerignore`; scratch `e2e/smoke.mjs` (outside repo)

- [ ] Step 1: Write README (concept, cafe/table terms, run locally, OAuth setup, env, architecture, GameLoop order, network model and upgrade path, terrain architecture and op protocol, deployment, adding a vehicle/map, screenshots placeholders, next ideas, known limitations).
- [ ] Step 2: Run smoke with two guest sessions + late joiner; fix every console error found.
- [ ] Step 3: `npm run build && npm run lint && npm test` → PASS. Commit `docs: README, Dockerfile; fix smoke findings`.
