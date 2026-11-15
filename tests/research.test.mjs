import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTicker,searchDirectory,safeUrl,freshness,dedupeNews,assess} from '../site/lib/research.js';
const now = Date.parse('2026-11-13T22:00:00Z');
const news = (id, extra = {}) => ({id,headline:'Example '+id,url:'https://example.com/'+id,publishedAt:'2026-11-13T10:00:00Z',...extra});

test('ticker entry accepts class shares and rejects non-equity-style paths',()=>{
  assert.equal(normalizeTicker(' $brk-b '),'BRK.B');
  assert.equal(normalizeTicker('aapl'),'AAPL');
  for(const bad of ['../../secret','AAPL<script>','BTC/USD','ES=F','AAPL261120C00200000','']) assert.equal(normalizeTicker(bad),null);
});
test('autocomplete ranks exact symbol before company-name matches',()=>{
  const rows=[{symbol:'ZA',name:'Apple Services'},{symbol:'AAPL',name:'Apple Inc.'},{symbol:'AA',name:'Example'}];
  assert.equal(searchDirectory(rows,'aapl')[0].symbol,'AAPL');
  assert.deepEqual(searchDirectory(rows,'apple').map(x=>x.symbol),['AAPL','ZA']);
});
test('rendered links cannot execute scripts or load local files',()=>{
  for(const bad of ['javascript:alert(1)','data:text/html,<script>','file:///C:/secret','not a URL']) assert.equal(safeUrl(bad),null);
  assert.equal(safeUrl('https://www.sec.gov/'),'https://www.sec.gov/');
});
test('missing/future dates are never marked fresh',()=>{
  assert.equal(freshness(null,now),'unknown');
  assert.equal(freshness('2030-01-01',now),'unknown');
  assert.equal(freshness('2026-11-10',now),'stale');
  assert.equal(freshness('2026-11-13T21:00:00Z',now),'fresh');
});
test('deduplication avoids counting syndicated copies twice',()=>{
  assert.equal(dedupeNews([news('a',{headline:'Company Reports Results!'}),news('b',{headline:'Company reports results'})]).length,1);
});
test('unreviewed positive-sounding headlines cannot create bullish sentiment',()=>{
  const result=assess({news:[news('a',{headline:'Record profits and soaring demand',signal:'positive',signalReviewed:false})],filings:[]},now);
  assert.equal(result.sentiment,'neutral'); assert.equal(result.reviewedCount,0); assert.equal(result.bull.length,0);
});
test('reviewed evidence is cited; stale/future evidence cannot move sentiment',()=>{
  const result=assess({news:[news('a',{signal:'negative',signalReviewed:true}),news('b',{signal:'positive',signalReviewed:true,publishedAt:'2026-10-01'}),news('c',{signal:'positive',signalReviewed:true,publishedAt:'2026-12-01'})],filings:[]},now);
  assert.equal(result.sentiment,'negative'); assert.equal(result.newsCount,1); assert.equal(result.bear[0].id,'a');
});
test('routine Form 4 filing is not treated as an insider purchase or catalyst',()=>{
  const result=assess({news:[],filings:[{id:'f',form:'4',filedAt:'2026-11-12'}]},now);
  assert.equal(result.filingCount,1);assert.equal(result.catalysts.length,0);assert.equal(result.sentiment,'neutral');
});
