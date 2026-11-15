import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile('site/data/manifest.json','utf8'));
if (manifest.schemaVersion !== 1 || !['demo','collected'].includes(manifest.mode)) throw new Error('Invalid manifest');
for (const entry of manifest.tickers) {
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(entry.symbol)) throw new Error('Invalid ticker path');
  const data = JSON.parse(await readFile(`site/data/tickers/${entry.symbol}.json`,'utf8'));
  if (data.symbol !== entry.symbol || Boolean(data.demo) !== (manifest.mode === 'demo')) throw new Error('Mixed demo/live data');
}
await mkdir('dist',{recursive:true});
await cp('site','dist',{recursive:true});
// GitHub Pages serves assets with a cache lifetime. Fingerprint their URLs so
// a new deployment cannot mix a new HTML document with an older script/style.
const hash = createHash('sha256');
for (const path of ['site/app.js','site/styles.css','site/readability.css','site/lib/research.js','site/lib/insights.js']) hash.update(await readFile(path));
const version = hash.digest('hex').slice(0,12);
const html = (await readFile('dist/index.html','utf8')).replace('./styles.css',`./styles.css?v=${version}`).replace('./app.js',`./app.js?v=${version}`);
await writeFile('dist/index.html',html.replace('./readability.css',`./readability.css?v=${version}`));
const app = (await readFile('dist/app.js','utf8')).replace("'./lib/research.js'",`'./lib/research.js?v=${version}'`);
await writeFile('dist/app.js',app.replace("'./lib/insights.js'",`'./lib/insights.js?v=${version}'`));
await writeFile('dist/.nojekyll','');
console.log(`Built ${manifest.tickers.length} ${manifest.mode} snapshots at ${resolve('dist')}`);
