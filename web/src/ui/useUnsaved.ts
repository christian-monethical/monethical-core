import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';

/** Number of mounted editors with unsaved changes. The shell asks before navigating away. */
export const dirtyCount = signal(0);

/** Register the calling editor as dirty/clean; also guards tab close/reload. */
export function useUnsavedGuard(dirty: boolean): void {
  const wasDirty = useRef(false);
  useEffect(() => {
    if (dirty !== wasDirty.current) {
      dirtyCount.value += dirty ? 1 : -1;
      wasDirty.current = dirty;
    }
  }, [dirty]);
  useEffect(
    () => () => {
      if (wasDirty.current) dirtyCount.value -= 1;
      wasDirty.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!dirty) return;
    const block = (e: BeforeUnloadEvent): void => e.preventDefault();
    window.addEventListener('beforeunload', block);
    return () => window.removeEventListener('beforeunload', block);
  }, [dirty]);
}

export interface Draft<T> {
  value: T;
  set: (next: T) => void;
  patch: (partial: Partial<T>) => void;
  dirty: boolean;
  /** Mark the current value as the saved baseline. */
  commit: (saved?: T) => void;
  reset: () => void;
}

/** Editable copy of server data with dirty tracking and the unsaved-changes guard. */
export function useDraft<T extends object>(initial: T): Draft<T> {
  const [baseline, setBaseline] = useState(initial);
  const [value, setValue] = useState(initial);
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);
  useUnsavedGuard(dirty);
  return {
    value,
    set: setValue,
    patch: (partial) => setValue((v) => ({ ...v, ...partial })),
    dirty,
    commit: (saved) => {
      const next = saved ?? value;
      setBaseline(next);
      setValue(next);
    },
    reset: () => setValue(baseline),
  };
}
