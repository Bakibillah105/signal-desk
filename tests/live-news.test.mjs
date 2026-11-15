import test from 'node:test';
import assert from 'node:assert/strict';
import {tradingViewSymbol} from '../site/lib/live-news.js';
test('news embed targets the requested exchange and symbol',()=>{
  assert.equal(tradingViewSymbol({symbol:'OOMA',exchange:'NYSE'}),'NYSE:OOMA');
  assert.equal(tradingViewSymbol({symbol:'AAPL',exchange:'Nasdaq'}),'NASDAQ:AAPL');
  assert.equal(tradingViewSymbol({symbol:'BRK.B',exchange:'NYSE'}),'NYSE:BRK.B');
  assert.equal(tradingViewSymbol({symbol:'<script>',exchange:'NYSE'}),null);
});
