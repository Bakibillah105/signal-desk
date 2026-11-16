import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceBrief} from '../site/lib/brief.js';
const now=Date.parse('2026-11-16T12:00:00Z');
const item=(headline,extra={})=>({id:headline,headline,summary:'',url:'https://publisher.example/story',source:'Example',publishedAt:'2026-11-15T12:00:00Z',...extra});
test('brief links conditional cases to matching evidence without guessing sentiment',()=>{
 const b=evidenceBrief({symbol:'TEST',news:[item('TEST cuts revenue guidance'),item('TEST launches product')]},now);
 assert.equal(b.themes.length,2); assert.equal(b.themes[0].items[0].headline,'TEST cuts revenue guidance');
 assert.match(b.themes[0].bull,/if/); assert.match(b.description,/single-source/);
 assert.equal(b.sentiment,undefined);
});
test('missing evidence and retrieval failures remain distinct from neutral findings',()=>{
 const b=evidenceBrief({symbol:'TEST',news:[],feedStatuses:[{state:'error'}]},now);
 assert.equal(b.label,'Coverage gap');assert.match(b.description,/collection gap/);assert.equal(b.themes.length,0);
});
test('old, future, invalid and duplicate reports cannot inflate coverage',()=>{
 const b=evidenceBrief({symbol:'TEST',news:[item('Earnings'),item('Earnings'),item('Old',{publishedAt:'2025-01-01'}),item('Future',{publishedAt:'2027-01-01'}),item('Invalid',{publishedAt:'x'})]},now);
 assert.equal(b.news.length,1);
});
test('unmatched coverage is not given an invented thesis',()=>{
 const b=evidenceBrief({symbol:'TEST',news:[item('Company update')]},now);
 assert.equal(b.themes.length,0);assert.match(b.description,/No supported topic rule/);
});
