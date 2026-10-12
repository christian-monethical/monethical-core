/**
 * Chunk prefetching. Route modules are registered with their dynamic import; hovering/focusing a
 * link (or an idle callback after first paint) warms the chunk so navigation feels instant.
 */
type Loader = () => unknown;

const done = new WeakSet<Loader>();

export function prefetch(loader: Loader | undefined): void {
  if (!loader || done.has(loader)) return;
  done.add(loader);
  try {
    void Promise.resolve(loader()).catch(() => done.delete(loader));
  } catch {
    done.delete(loader);
  }
}

/** Spread onto a link: `{...prefetchOnIntent(loader)}`. */
export function prefetchOnIntent(loader: Loader | undefined): {
  onMouseEnter: () => void;
  onFocus: () => void;
  onTouchStart: () => void;
} {
  const go = (): void => prefetch(loader);
  return { onMouseEnter: go, onFocus: go, onTouchStart: go };
}

export function prefetchWhenIdle(loaders: Loader[]): void {
  const run = (): void => loaders.forEach(prefetch);
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 2000);
}
