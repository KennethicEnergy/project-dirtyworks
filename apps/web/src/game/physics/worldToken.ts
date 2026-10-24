import type { World } from "@dimforge/rapier3d-compat";

/**
 * @react-three/rapier hands out a proxy that silently swaps in a fresh World after its <Physics>
 * unmounts (React Strict Mode does this in development). Handles from the old world are
 * meaningless in the new one — removing them panics or, worse, removes someone else's object.
 * Capture a token when creating physics objects and only clean up if the world is unchanged.
 */
export type WorldToken = object;

export function worldToken(world: World): WorldToken {
  return world.bodies;
}

export function isSameWorld(world: World, token: WorldToken): boolean {
  return world.bodies === token;
}
