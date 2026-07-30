const actorOperations = new WeakMap();

export function requireActorOwner(actor) {
  if (!actor?.isOwner) {
    throw new Error('You do not have permission to update this Vessel.');
  }
}

/**
 * Serialize all module-owned state transitions for one Actor document.
 *
 * Callers that compose operations must use their sibling `*Unlocked` helper
 * inside an existing operation, rather than enqueueing the same Actor again.
 */
export async function serializeActorOperation(actor, operation) {
  requireActorOwner(actor);
  const previous = actorOperations.get(actor) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => operation(actor));
  actorOperations.set(actor, current);
  try {
    return await current;
  } finally {
    if (actorOperations.get(actor) === current) actorOperations.delete(actor);
  }
}
