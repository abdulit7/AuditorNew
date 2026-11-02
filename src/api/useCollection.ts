import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api, ApiError } from './client';

/**
 * A drop-in replacement for useState<T[]> that persists to the API.
 * Pages keep calling setX(prev => ...) exactly as before; this hook diffs the result by `id` and
 * sends POST / PUT / DELETE in order. The UI updates immediately; if the server refuses a change
 * (permission, validation, duplicate code) the list is reloaded from the server and the reason is shown.
 */
export function useCollection<T extends { id: string }>(
  path: string,
  onError: (message: string) => void
): [T[], Dispatch<SetStateAction<T[]>>, (items: T[]) => void] {
  const [items, setState] = useState<T[]>([]);
  const ref = useRef<T[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const errRef = useRef(onError);
  errRef.current = onError;

  const hydrate = useCallback((next: T[]) => {
    ref.current = next;
    setState(next);
  }, []);

  const apply = useCallback((fn: (cur: T[]) => T[]) => {
    ref.current = fn(ref.current);
    setState(ref.current);
  }, []);

  const setItems: Dispatch<SetStateAction<T[]>> = useCallback(
    (u) => {
      const prev = ref.current;
      const next = typeof u === 'function' ? (u as (p: T[]) => T[])(prev) : u;
      if (next === prev) return;
      ref.current = next;
      setState(next);

      const before = new Map(prev.map((x) => [x.id, JSON.stringify(x)]));
      const after = new Map(next.map((x) => [x.id, x]));
      const created = next.filter((x) => !before.has(x.id));
      const changed = next.filter((x) => before.has(x.id) && before.get(x.id) !== JSON.stringify(x));
      const removed = prev.filter((x) => !after.has(x.id));
      if (!created.length && !changed.length && !removed.length) return;

      queue.current = queue.current.then(async () => {
        try {
          for (const it of created) {
            const saved = await api<T>(`/api/${path}`, { method: 'POST', json: it });
            apply((cur) => cur.map((x) => (x.id === it.id ? saved : x)));
          }
          for (const it of changed) {
            const saved = await api<T>(`/api/${path}/${encodeURIComponent(it.id)}`, { method: 'PUT', json: it });
            apply((cur) => cur.map((x) => (x.id === it.id ? saved : x)));
          }
          for (const it of removed) {
            await api(`/api/${path}/${encodeURIComponent(it.id)}`, { method: 'DELETE' });
          }
        } catch (e) {
          errRef.current(e instanceof ApiError ? e.message : 'Could not save your change.');
          try {
            hydrate(await api<T[]>(`/api/${path}`)); // roll back to what the server really has
          } catch {
            /* offline: leave the optimistic state; the user was already told */
          }
        }
      });
    },
    [path, apply, hydrate]
  );

  return [items, setItems, hydrate];
}
