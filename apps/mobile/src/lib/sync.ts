import { useEffect, useRef } from 'react';

/** Settings areas the agent (or another screen) can change. Mirrors SyncScope in @trillion/shared. */
export type SyncScope = 'schedules' | 'memories' | 'connections';

type Listener = (scope: SyncScope) => void;
const listeners = new Set<Listener>();

/** Tiny in-app event bus: the chat publishes `state_changed` events, settings screens reload. */
export function publish(scope: SyncScope) {
  for (const l of listeners) {
    try {
      l(scope);
    } catch {
      /* one broken screen must not affect the others */
    }
  }
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Calls `reload` whenever one of `scopes` changes. `reload` may change identity freely. */
export function useSync(scopes: SyncScope[], reload: () => void) {
  const fn = useRef(reload);
  fn.current = reload;
  const key = scopes.join(',');
  useEffect(() => subscribe((s) => key.split(',').includes(s) && fn.current()), [key]);
}
