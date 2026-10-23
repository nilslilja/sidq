import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const here = path.resolve(process.argv[2]);          // nerdbase/assets
const exe = '/opt/pw-browsers/chromium';
const b = await chromium.launch({ executablePath: undefined });
const ctx = await b.newContext({ deviceScaleFactor: 1 });
// 1. icon
{ const p = await ctx.newPage(); await p.setViewportSize({ width: 1024, height: 1024 });
  await p.goto(pathToFileURL(path.join(here, 'icon/icon.svg')).href);
  await p.screenshot({ path: path.join(here, 'icon/AppIcon-1024.png'), omitBackground: false }); }
// 2. screenshots
for (let n = 1; n <= 5; n++) {
  const p = await ctx.newPage(); await p.setViewportSize({ width: 1290, height: 2796 });
  await p.goto(pathToFileURL(path.join(here, 'prototype/shots.html')).href + '?n=' + n);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(here, `screenshots/${n}.png`), clip: { x: 0, y: 0, width: 1290, height: 2796 } });
}
// 3. gallery check
{ const p = await ctx.newPage(); await p.setViewportSize({ width: 1500, height: 1000 });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(pathToFileURL(path.join(here, 'prototype/gallery.html')).href); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(here, 'prototype/gallery-preview.png'), fullPage: true });
  console.log('gallery errors:', errs); }
await b.close();
