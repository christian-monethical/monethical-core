import type { Surface } from '../../api/types';

/** Mirrors `Surface` defaults in backend/src/monethical/domain/styles.py. */
export const DEFAULT_SURFACE: Surface = {
  background: '#ffffff',
  text: '#1d1d1f',
  muted: '#6e6e73',
  accent: '#0f172a',
  accent_text: '#ffffff',
  border: '#e5e5ea',
  radius: 14,
  elevation: 'medium',
  density: 'comfortable',
  font: 'system',
};
