import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/preact';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});
