import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWatchlist,filingInsight,narrative} from '../site/lib/insights.js';
test('bulk tickers normalize separators, exchange prefixes and class shares',()=>{
  const r=parseWatchlist('aapl, NASDAQ:MSFT\n$AAPL; BRK-B FAKE ES=F',[{symbol:'AAPL'},{symbol:'MSFT'},{symbol:'BRK.B'}]);
  assert.deepEqual(r.accepted,['AAPL','MSFT','BRK.B']);assert.deepEqual(r.rejected,['FAKE','ES=F']);
});
test('SEC interpretation identifies earnings and avoids claiming a surprise',()=>{
  assert.match(filingInsight({form:'8-K',items:'2.02,9.01'}),/compare earnings and guidance with expectations/);
  assert.match(filingInsight({form:'4'}),/not a bullish or bearish signal/);
  assert.match(filingInsight({form:'10-Q/A'}),/Amended filing/);
});
test('missing news cannot produce an optimistic overall conclusion',()=>{
  assert.match(narrative({symbol:'TEST'},{newsCount:0}),/not enough current news/);
  assert.match(narrative({demo:true},{}),/fictional examples/);
});
