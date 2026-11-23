import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

/** Every file in `dir` (recursively), as paths relative to it. */
function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(dir, `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );
}

/**
 * Writes dist/sw.js: the worker template with this build's id and the list of
 * files to keep on the device (everything the build emits plus `public/`).
 */
function serviceWorkerFile(): Plugin {
  return {
    name: 'training-planner:service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const emitted = Object.keys(bundle);
      const publicFiles = listFiles(fileURLToPath(new URL('./public', import.meta.url)));
      const files = ['./', ...new Set([...emitted, ...publicFiles])].filter(
        (name) => name !== 'version.json' && name !== 'sw.js',
      );
      const template = readFileSync(fileURLToPath(new URL('./sw/worker.js', import.meta.url)), 'utf-8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__BUILD_ID__', JSON.stringify(buildId))
          .replace('__PRECACHE__', JSON.stringify(files)),
      });
    },
  };
}

// `base: './'` + hash routing keep the build location-independent: the same
// `dist/` works under a GitHub Pages sub-path, at a domain root, or on any
// other static host without rebuilding.
export default defineConfig({
  base: './',
  build: {
    // Preload links fetched before the service worker takes part make Chrome log
    // "cross-world service worker resource mismatch" warnings; the chunks are stored by
    // the service worker anyway, so the saving is small.
    modulePreload: false,
  },
  plugins: [react(), tailwindcss(), versionFile(), serviceWorkerFile()],
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
