import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const appVersion = process.env.npm_package_version ?? '0.0.0';
// Unique per build, so an update is detected even without a version bump.
const buildId = `${appVersion}+${Date.now().toString(36)}`;

/** Publishes the build id as version.json for the in-app update check. */
function versionFile(): Plugin {
  return {
    name: 'training-planner:version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ version: appVersion, buildId })}\n`,
      });
    },
  };
}

// `base: './'` + hash routing keep the build location-independent: the same
// `dist/` works under a GitHub Pages sub-path, at a domain root, or on any
// other static host without rebuilding.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), versionFile()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_ID__: JSON.stringify(buildId),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Needed so the token contrast test can read tokens.css via `?raw`.
    css: true,
    restoreMocks: true,
  },
});
