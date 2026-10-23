import vm from 'node:vm'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
export function load(files) {
  const ctx = vm.createContext({ console, Math, Date, JSON, Number, String, Array, Object, Set, Map, Error, NB: {} });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(here, '..', 'src', f), 'utf8'), ctx, { filename: f });
  return ctx.NB;
}
let fails = 0, passes = 0;
export const t = (name, cond) => { if (cond) passes++; else { fails++; console.log('FAIL', name); } };
export const done = () => { console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0); };
