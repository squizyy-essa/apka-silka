// Renders scripts/icon.svg into the PNG app icons in public/icons.
// Run with: node scripts/generate-icons.mjs  (needs Google Chrome, like the e2e tests)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const SIZES = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

const svg = await readFile(fileURLToPath(new URL('./icon.svg', import.meta.url)), 'utf8');
const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const { file, size } of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: `${outDir}${file}`, omitBackground: false });
    await page.close();
    console.log(`written public/icons/${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
