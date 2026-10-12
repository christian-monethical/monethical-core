import { signal } from '@preact/signals';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export const toasts = signal<ToastItem[]>([]);
let seq = 0;

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((x) => x.id !== id);
}

export function toast(kind: ToastKind, message: string, ttlMs = kind === 'error' ? 8000 : 4000): void {
  const id = ++seq;
  toasts.value = [...toasts.value.slice(-3), { id, kind, message }];
  setTimeout(() => dismissToast(id), ttlMs);
}

export const toastSuccess = (message: string): void => toast('success', message);
