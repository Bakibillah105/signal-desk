import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const manifest = JSON.parse(await readFile('site/data/manifest.json','utf8'));
if (manifest.schemaVersion !== 1 || !['demo','collected'].includes(manifest.mode)) throw new Error('Invalid manifest');
for (const entry of manifest.tickers) {
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(entry.symbol)) throw new Error('Invalid ticker path');
  const data = JSON.parse(await readFile(`site/data/tickers/${entry.symbol}.json`,'utf8'));
  if (data.symbol !== entry.symbol || Boolean(data.demo) !== (manifest.mode === 'demo')) throw new Error('Mixed demo/live data');
}
await mkdir('dist',{recursive:true});
await cp('site','dist',{recursive:true});
await writeFile('dist/.nojekyll','');
console.log(`Built ${manifest.tickers.length} ${manifest.mode} snapshots at ${resolve('dist')}`);
