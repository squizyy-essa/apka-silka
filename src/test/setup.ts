import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement scrolling; the router's scroll restoration calls it.
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
}

// Slow machines (CI) need more than the default 1 s for database-backed screens.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  if (typeof document === 'undefined') {
    return; // test file running in the plain Node environment
  }
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-style');
});
