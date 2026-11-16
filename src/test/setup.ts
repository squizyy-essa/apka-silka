import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement scrolling; the router's scroll restoration calls it.
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn();
}

afterEach(() => {
  if (typeof document === 'undefined') {
    return; // test file running in the plain Node environment
  }
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-style');
});
