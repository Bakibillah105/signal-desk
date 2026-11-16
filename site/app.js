import {evidenceBrief} from './lib/brief.js';
import {mountLiveNews, tradingViewSymbol} from './lib/live-news.js';
import {parseWatchlist, filingInsight, narrative} from './lib/insights.js';
import { normalizeTicker, searchDirectory, safeUrl, freshness, dedupeNews, assess } from './lib/research.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = (url, label, cls = '') => safeUrl(url) ? `<a class="${cls}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>` : `<span>${label}</span>`;
const date = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'}).format(d) : 'Date unavailable'; };
const number = (n, options = {}) => n !== null && n !== undefined && Number.isFinite(Number(n)) ? new Intl.NumberFormat('en-US', options).format(n) : '—';
const store = {get(key, fallback) {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}},set(key,value) {try {localStorage.setItem(key,JSON.stringify(value));} catch { /* Browsing without persistence is supported. */ }}};
let publicNews = {bySymbol:{},sources:[]};
let manifest, directory = [], current = null, activeSuggestion = -1, suggestions = [], generation = 0, newsFilter = 'all', filingFilter = 'all';
let watchlist = store.get('signaldesk-watchlist', []);
if (!Array.isArray(watchlist)) watchlist = [];
watchlist = watchlist.filter(x => normalizeTicker(x) === x);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme-toggle').textContent = theme === 'dark' ? '☀' : '☾';
  $('#theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  store.set('signaldesk-theme', theme);
  if (current) renderNews();
}
const preferredTheme = store.get('signaldesk-theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
setTheme(['light','dark'].includes(preferredTheme) ? preferredTheme : 'light');
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

async function json(path) {
  const response = await fetch(path, {cache:'no-cache', signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function openDialog(title, content) {
  $('#dialog-title').textContent = title;
  $('#dialog-content').innerHTML = content;
  $('#info-dialog').showModal();
}
$('#close-dialog').addEventListener('click', () => $('#info-dialog').close());
$('#info-dialog').addEventListener('click', event => { if (event.target === $('#info-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); }});

function methodology() {
  const statuses=(publicNews.sources ?? []).map(x=>`<li>${esc(x.source)}${x.symbol?' / '+esc(x.symbol):''}: ${esc(x.state==='ok'?`${x.count} recent feed items retrieved`:x.reason ?? 'Unavailable')} (${esc(date(x.fetchedAt))})</li>`).join('');
  openDialog('Sources & collection status', `<h3>Connected</h3><p>TradingView supplies the on-demand symbol news widget. Stories open at the provider. It is an embedded view, not extracted input for the assessment. Public RSS collection runs every two hours, subject to GitHub scheduling and source availability. Nasdaq, Yahoo Finance and SEC company feeds use the configured collection list (separate from the searchable directory); broad feeds are matched against company names and explicit tickers.</p><ul>${statuses || '<li>No RSS collection status is available.</li>'}</ul><h3>Your requested sources</h3><p>SEC EDGAR: public company feeds are attempted, with metadata-only filing explanations. Nasdaq, Yahoo Finance, Investing.com and Benzinga: public feed retrieval is attempted, with the results shown above. Finnhub and Benzinga APIs: adapters exist but keys are not configured. NYSE, Reuters, Bloomberg, StockAnalysis, Koyfin, TIKR, Macrotrends, Earnings Whispers and Finviz have no direct extractors. Public Google News RSS discovery searches the requested publisher domains and accepts only attributed results from those domains. Indexed headlines are labelled; their links pass through Google News to the article. This does not provide full text, access to paywalled content, or guaranteed coverage of every publisher.</p><h3>Stocktwits</h3><p>${link('https://stocktwits.com/symbol/'+encodeURIComponent(current?.symbol ?? 'AAPL'),'Open this ticker on Stocktwits')}. Social discussion is not verified reporting. Stocktwits API access is separate; community posts, if discovered in the public index, are excluded from the evidence brief.</p><h3>Assessment</h3><p>The free evidence brief groups collected headlines and short excerpts into earnings, demand, funding, regulation, leadership and analyst topics. Each conditional bull/bear case links to its matching stories. It does not infer that a condition occurred, rate sentiment, or read full articles. Filings receive form-level educational explanations, not document-content analysis. Demo prices, stories and filing rows are hidden from normal research. Unknown quotes and dates remain blank.</p><h3>Privacy and refresh</h3><p>The TradingView embed contacts TradingView and follows its privacy policy; it may set its own cookies. ${link('https://www.tradingview.com/privacy-policy/','TradingView privacy policy')}. Your saved watchlist stays in this browser. Refresh reloads the latest collected RSS data and the live widget; it does not trigger a GitHub Action.</p>`);
}
$('#open-method').addEventListener('click', methodology);

function showWatchlist() {
  openDialog('My watchlist', `<p>Paste tickers separated by spaces, commas or new lines. Click a saved company to open its available research.</p><form id="bulk-watch-form"><label for="bulk-tickers">Add stocks</label><textarea id="bulk-tickers" rows="3" placeholder="AAPL, MSFT, NVDA&#10;AMD TSLA"></textarea><button class="search-submit" type="submit">Add to watchlist</button></form><p id="watch-feedback" role="status"></p><div class="watch-scroll" role="region" aria-label="Saved companies" tabindex="0"></div>`);
  function draw() {
    $('.watch-scroll').innerHTML = watchlist.length ? watchlist.map(symbol => `<div class="dialog-watchlist"><button class="watch-open" data-watch-open="${esc(symbol)}"><strong>${esc(symbol)}</strong><span>${esc(directory.find(x => x.symbol === symbol)?.name ?? 'Listing not in current directory')}</span><small>${'Open ticker news'}</small></button><button data-watch-remove="${esc(symbol)}" aria-label="Remove ${esc(symbol)}">Remove</button></div>`).join('') : '<p>Your watchlist is empty. Add your first tickers above.</p>';
    document.querySelectorAll('[data-watch-open]').forEach(button => button.addEventListener('click', () => { $('#info-dialog').close(); navigate(button.dataset.watchOpen); }));
    document.querySelectorAll('[data-watch-remove]').forEach(button => button.addEventListener('click', () => { watchlist=watchlist.filter(x=>x!==button.dataset.watchRemove);store.set('signaldesk-watchlist',watchlist);draw();renderQuick();if(current)renderResearch(); }));
  }
  $('#bulk-watch-form').addEventListener('submit',event=>{
    event.preventDefault();
    const result=parseWatchlist($('#bulk-tickers').value,directory);
    const before=watchlist.length;
    watchlist=[...new Set([...watchlist,...result.accepted])];store.set('signaldesk-watchlist',watchlist);
    $('#watch-feedback').textContent=`Added ${watchlist.length-before} stocks. ${result.rejected.length?'Not in the current directory: '+result.rejected.join(', '):'Duplicates were skipped.'}`;
    if(!result.rejected.length) $('#bulk-tickers').value='';
    draw();renderQuick();if(current)renderResearch();
  });
  draw();
}
$('#open-watchlist').addEventListener('click', showWatchlist);
$('#mobile-watchlist').addEventListener('click', showWatchlist);
function renderQuick() {
  $('#watch-count').textContent = watchlist.length;
  $('#quick-tickers').innerHTML = (watchlist.length ? watchlist.map(symbol => directory.find(x=>x.symbol===symbol) ?? {symbol,name:symbol}) : (manifest?.tickers ?? [])).map(t => `<button class="quick-ticker ${current?.symbol === t.symbol ? 'selected' : ''}" data-ticker="${esc(t.symbol)}"><span class="mini-logo">${esc(t.symbol[0])}</span><span><strong>${esc(t.symbol)}</strong><small>${esc(t.name.length > 22 ? t.name.slice(0,20)+'…' : t.name)}</small></span><span class="quick-arrow">↗</span></button>`).join('');
  document.querySelectorAll('[data-ticker]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.ticker)));
}

function hideSuggestions() { $('#suggestions').hidden = true; $('#ticker-input').setAttribute('aria-expanded','false'); $('#ticker-input').removeAttribute('aria-activedescendant'); activeSuggestion = -1; }
function showSuggestions() {
  suggestions = searchDirectory(directory, $('#ticker-input').value);
  activeSuggestion = -1;
  $('#suggestions').innerHTML = suggestions.map((t,i) => `<li id="suggestion-${i}" role="option" aria-selected="false" data-suggestion="${i}"><strong>${esc(t.symbol)}</strong><span>${esc(t.name)}</span><small>${esc(t.exchange)}</small></li>`).join('');
  $('#suggestions').hidden = !suggestions.length;
  $('#ticker-input').setAttribute('aria-expanded', String(Boolean(suggestions.length)));
  $('#ticker-input').removeAttribute('aria-activedescendant');
  document.querySelectorAll('[data-suggestion]').forEach(item => item.addEventListener('mousedown', event => { event.preventDefault(); navigate(suggestions[Number(item.dataset.suggestion)].symbol); }));
}
$('#ticker-input').addEventListener('input', () => { $('#search-error').textContent = ''; showSuggestions(); });
$('#ticker-input').addEventListener('focus', showSuggestions);
$('#ticker-input').addEventListener('keydown', event => {
  if (event.key === 'Escape') hideSuggestions();
  if (['ArrowDown','ArrowUp'].includes(event.key)) {
    event.preventDefault(); if ($('#suggestions').hidden) showSuggestions(); if (!suggestions.length) return;
    activeSuggestion = (activeSuggestion + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
    document.querySelectorAll('[data-suggestion]').forEach((el,i) => el.setAttribute('aria-selected',String(i === activeSuggestion)));
    $('#ticker-input').setAttribute('aria-activedescendant',`suggestion-${activeSuggestion}`);
  }
});
document.addEventListener('click', event => { if (!$('#search-form').contains(event.target)) hideSuggestions(); });
document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !$('#info-dialog').open) { event.preventDefault(); $('#ticker-input').focus(); } });
$('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  if (activeSuggestion >= 0 && !$('#suggestions').hidden) return navigate(suggestions[activeSuggestion].symbol);
  const input = $('#ticker-input').value;
  let ticker = normalizeTicker(input);
  if (!directory.some(x => x.symbol === ticker)) {
    const matches = directory.filter(x => x.name.toLowerCase() === input.trim().toLowerCase());
    ticker = matches.length === 1 ? matches[0].symbol : null;
  }
  if (!ticker) { hideSuggestions(); $('#search-error').textContent = 'Choose a stock from the US exchange directory. Funds, derivatives and OTC symbols are not included.'; return; }
  navigate(ticker);
});
function navigate(symbol) { hideSuggestions(); $('#ticker-input').value = symbol; $('#ticker-input').blur(); if (location.hash === `#ticker=${encodeURIComponent(symbol)}`) loadTicker(symbol); else location.hash = `ticker=${encodeURIComponent(symbol)}`; }
window.addEventListener('hashchange', route);
function route() {
  if (location.hash.startsWith('#ticker=')) { let symbol; try { symbol = normalizeTicker(decodeURIComponent(location.hash.slice(8))); } catch { symbol = null; } loadTicker(symbol); }
  else if (!current) loadTicker(manifest?.tickers?.[0]?.symbol ?? 'AAPL');
}
function renderBanner() {
  $('#mode-banner').classList.add('collected');
  $('#mode-banner').innerHTML = '<span><strong>Free evidence brief.</strong> Collected source excerpts drive the assessment below. It uses transparent topic rules and conditional cases; it does not read full articles. TradingView is a separate supplementary feed.</span><button id="data-setup">Source details</button>';
  $('#data-setup').addEventListener('click',methodology);
}
function attachPublicNews(data) {
  const extra=publicNews.bySymbol?.[data.symbol] ?? [];
  data.sources.tradingview={state:'embedded'};
  data.feedStatuses=(publicNews.sources ?? []).filter(x=>!x.symbol || x.symbol===data.symbol);
  const sec=publicNews.filingsBySymbol?.[data.symbol];
  if(sec){data.filings=sec;data.sources.sec={state:'ok',fetchedAt:publicNews.generatedAt};}
  const bz=publicNews.sources?.find(s=>s.source==='Benzinga');
  if(bz)data.sources.benzinga={state:bz.state,fetchedAt:bz.fetchedAt};
  data.news=dedupeNews([...(data.news ?? []),...extra]).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  if(extra.length) data.sources.news={state:'ok',fetchedAt:publicNews.generatedAt};
  return data;
}

async function loadTicker(symbol) {
  $('#search-error').textContent = '';
  const listing = directory.find(x => x.symbol === symbol);
  if (!listing) { $('#search-error').textContent = 'This ticker is not in the current US equity directory.'; if (!current) $('#research').innerHTML = '<section class="panel empty-state">Search a supported US-listed company to begin.</section>'; return; }
  const token = ++generation;
  document.title = `${symbol} · Signal Desk`;
  $('#ticker-input').value = symbol;
  $('#research').innerHTML = '<div class="loading-state"><span class="loader"></span> Loading company research…</div>';
  $('#research').setAttribute('aria-busy','true');
  const available = manifest.mode !== 'demo' && manifest.tickers.some(x => x.symbol === symbol);
  if (!available) {
    newsFilter = 'all'; filingFilter = 'all'; current = attachPublicNews({...listing, schemaVersion:1, demo:false, profile:{}, news:[],filings:[],sources:{}, notCollected:true}); renderResearch(); renderQuick();
    $('#research').removeAttribute('aria-busy'); return;
  }
  try {
    const data = await json(`./data/tickers/${encodeURIComponent(symbol)}.json`);
    if (token !== generation) return;
    if (data.symbol !== symbol || data.schemaVersion !== 1 || Boolean(data.demo) !== (manifest.mode === 'demo')) throw new Error('Snapshot validation failed');
    current = attachPublicNews(data); newsFilter = 'all'; filingFilter = 'all'; renderResearch(); renderQuick();
    document.title = `${symbol} · Signal Desk`;
  } catch {
    if (token !== generation) return;
    $('#research').innerHTML = '<section class="panel empty-state"><h3>Research snapshot unavailable</h3><p>The file could not be loaded. Your connection or the latest deployment may be incomplete.</p><button id="retry-load" class="subtle-button">Try again</button></section>';
    $('#retry-load').addEventListener('click', () => loadTicker(symbol));
  } finally { if (token === generation) $('#research').removeAttribute('aria-busy'); }
}

function sourceStamp(status) {
  if(status?.state==='embedded')return 'External feed';
  if (!status || status.state === 'missing') return 'Not connected';
  if (current.demo) return 'Fictional sample';
  if (status.state === 'error') return 'Unavailable';
  const f = freshness(status.fetchedAt, Date.now(), manifest.staleAfterHours);
  return f === 'fresh' ? 'Collected' : f === 'stale' ? 'Stale' : 'Time unverified';
}
function renderResearch() {
  const d = current, p = d.profile ?? {}, q = d.quote ?? {}, m = d.metrics ?? {};
  const quoteFreshness = freshness(q.asOf, Date.now(), manifest.staleAfterHours);
  const stamp = !d.demo && q.asOf && quoteFreshness !== 'fresh' ? (quoteFreshness === 'stale' ? 'Stale quote' : 'Quote time unverified') : sourceStamp(d.sources?.market);
  const priceTime = q.asOf ? date(q.asOf) : 'Time unavailable';
  const watchSaved = watchlist.includes(d.symbol);
  $('#research').innerHTML = `
  <section class="company-card" aria-label="Company snapshot"><div class="company-top"><div class="company-heading"><div class="company-logo" aria-hidden="true">${esc(d.symbol[0])}</div><div><div class="ticker-label"><strong>${esc(d.symbol)}</strong><span> / </span><span>${esc(d.exchange)}</span></div><h2>${esc(d.name)}</h2><div class="company-meta">${esc(p.sector ?? 'Sector unavailable')}<span>·</span>${esc(p.industry ?? 'Industry unavailable')}</div></div></div><div><div class="company-tools"><button id="save-ticker" class="subtle-button ${watchSaved ? 'saved' : ''}" aria-pressed="${watchSaved}">${watchSaved ? '★ Saved' : '☆ Save'}</button><button id="refresh-ticker" class="subtle-button" title="Reload the latest deployed snapshot">↻ Refresh snapshot</button></div><div class="data-stamp">${esc(stamp)}${q.asOf ? ' · '+esc(priceTime) : ''}</div></div></div><div class="stats-grid">
  <div class="stat"><span class="stat-label">Share price · USD</span><span class="stat-value">${q.price == null ? '—' : '$'+number(q.price,{minimumFractionDigits:2,maximumFractionDigits:2})}</span><div class="stat-note ${q.changePercent > 0 ? 'positive' : q.changePercent < 0 ? 'negative' : ''}">${q.changePercent == null ? 'Quote not connected' : `${q.changePercent >= 0 ? '+' : ''}${number(q.changePercent,{maximumFractionDigits:2})}% vs. previous close${d.demo ? ' · sample' : ''}`}</div></div>
  <div class="stat"><span class="stat-label">Market cap · USD</span><span class="stat-value">${m.marketCap == null ? '—' : '$'+number(m.marketCap,{notation:'compact',maximumFractionDigits:2})}</span><div class="stat-note">${d.demo ? 'Sample value' : 'Provider reported'}</div></div>
  <div class="stat"><span class="stat-label">P/E · trailing</span><span class="stat-value">${m.pe == null ? '—' : number(m.pe,{maximumFractionDigits:1})+'×'}</span><div class="stat-note">${m.pe == null ? 'Not available' : d.demo ? 'Sample value' : 'Trailing twelve months'}</div></div>
  <div class="stat"><span class="stat-label">Revenue growth · YoY</span><span class="stat-value ${m.revenueGrowth > 0 ? 'positive' : m.revenueGrowth < 0 ? 'negative' : ''}">${m.revenueGrowth == null ? '—' : (m.revenueGrowth>0?'+':'')+number(m.revenueGrowth,{maximumFractionDigits:1})+'%'}</span><div class="stat-note">${d.demo ? 'Sample value' : m.revenueGrowth == null ? 'Not available' : 'Provider reported'}</div></div>
  <div class="stat"><span class="stat-label">Research horizon</span><span class="stat-value">2–5 <span style="font-size:12px;font-weight:500">days</span></span><div class="stat-note">Trading sessions · long-only</div></div></div></section>
  <nav class="section-tabs" aria-label="Research sections"><a href="#news-panel" class="active">Overview</a><a href="#news-panel">Company news</a><a href="#filings-panel">SEC filings <span>${(d.filings ?? []).length}</span></a><a href="#assessment-panel">Assessment</a><a href="#next-stage">Industry & macro <span>NEXT</span></a></nav>
  <div class="content-grid"><div class="left-column"><section class="panel" id="news-panel"></section><section class="panel" id="filings-panel"></section><section class="panel stage-note" id="next-stage"><div><strong>The context beyond the company</strong><p>Peer developments, industry news, and macro drivers are planned for stage 2.</p></div><span>NEXT UP ↗</span></section></div><div class="right-column"><section class="panel assessment" id="assessment-panel"></section><section class="panel lens-card"><div class="panel-eyebrow">YOUR RESEARCH LENS</div><h3>Think in trading sessions.</h3><p>For a 2–5 day hold, focus on dated catalysts, new disclosures, and the earnings calendar.</p><div class="earnings-alert">${earningsText()}</div></section><section class="panel"><div class="panel-header"><h3>Source coverage</h3><span class="panel-eyebrow">${d.demo ? 'DEMO' : 'STATUS'}</span></div><div class="source-health">${['tradingview','sec','news','benzinga','market','earnings'].map(key => `<div class="health-row"><span>${({tradingview:'TradingView news',sec:'SEC EDGAR',news:'Matched RSS headlines',benzinga:'Benzinga RSS collection',market:'Quotes & fundamentals',earnings:'Earnings calendar'})[key]}</span><span class="health-state ${['Not connected','Stale','Time unverified'].includes(sourceStamp(d.sources?.[key])) ? 'warn' : sourceStamp(d.sources?.[key]) === 'Unavailable' ? 'fail' : ''}" title="${esc(d.sources?.[key]?.fetchedAt ?? 'No collection timestamp')}">${esc(sourceStamp(d.sources?.[key]))}</span></div>`).join('')}</div></section></div></div>`;
  $('#save-ticker').addEventListener('click', () => { const symbol = d.symbol; watchlist = watchlist.includes(symbol) ? watchlist.filter(x => x !== symbol) : [...watchlist,symbol]; store.set('signaldesk-watchlist',watchlist); renderResearch(); renderQuick(); });
  $('#refresh-ticker').addEventListener('click', async () => { const button = $('#refresh-ticker'); button.disabled = true; button.textContent = 'Refreshing…'; try { [manifest,publicNews] = await Promise.all([json('./data/manifest.json'),json('./data/public-news.json').catch(()=>({bySymbol:{},sources:[]}))]); renderBanner(); await loadTicker(d.symbol); } catch { $('#search-error').textContent = 'The latest snapshot could not be checked. Please try again.'; button.disabled = false; button.textContent = '↻ Refresh snapshot'; } });
  renderNews(); renderFilings(); renderAssessment();
  $('#assessment-panel').querySelectorAll('.evidence-link').forEach(anchor => anchor.addEventListener('click', event => {
    event.preventDefault();
    const target = anchor.getAttribute('href').slice(1);
    newsFilter = 'all'; filingFilter = 'all'; renderNews(); renderFilings();
    document.getElementById(target)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  }));
}
function earningsText() {
  const e = current.earnings;
  if (!e?.date) return '◷ Earnings date unverified. Check the issuer calendar before entering a position.';
  const days = (Date.parse(e.date+'T23:59:59Z')-Date.now()) / 86400000;
  return `${current.demo ? 'Sample event · ' : ''}${days >= 0 ? 'Upcoming' : 'Last reported'} earnings: ${esc(date(e.date+'T12:00:00Z'))}${days >= 0 && days <= 7 ? ' · Inside a 7-day event window. Review before entering.' : '. Verify the timing with the issuer.'}`;
}
function renderNews() {
  const symbol=tradingViewSymbol(current);
  const url=symbol?`https://www.tradingview.com/symbols/${symbol.replace(':','-')}/news/`:'https://www.tradingview.com/news/';
  $('#news-panel').innerHTML=`<div class="panel-header"><div><h3>${esc(current.symbol)} company news</h3><p>Collected publisher headlines and excerpts · free sources</p></div>${link(url,'Open news page','read-link')}</div><p class="feed-note">Open the original articles to verify details. Collection is partial; source failures and unmatched tickers are disclosed under Sources & methodology.</p><div id="collected-news"></div><details class="supplementary-news"><summary>Additional TradingView news (not included in assessment)</summary><div id="live-news"></div></details>`;
  mountLiveNews($('#live-news'),current,document.documentElement.dataset.theme);
  renderCollectedNews();
}
function renderCollectedNews() {
  const all = dedupeNews(current.news ?? []);
  const items = all.filter(n => newsFilter === 'all' || n.category === newsFilter);
  $('#collected-news').innerHTML = `<div class="panel-header"><div><h3>Collected headlines <span class="count-pill">${all.length}</span></h3><p>${current.demo ? 'Illustrative stories · not actual reporting' : all.length ? 'RSS excerpts · newest first · collected '+date(publicNews.generatedAt) : 'No matching items in the latest RSS collection'}</p></div><div class="news-controls" aria-label="Filter news">${[['all','All news'],['earnings','Earnings'],['company','Company']].map(([key,label])=>`<button class="filter-button ${newsFilter===key?'active':''}" data-news-filter="${key}" aria-pressed="${newsFilter===key}">${label}</button>`).join('')}</div></div>` + (items.length ? items.map(n=>`<article class="news-item" id="news-${esc(n.id)}"><div class="news-meta"><span class="source-dot">${esc(n.source?.[0] ?? 'N')}</span><span>${esc(n.source)}</span>${n.discovery?`<span>via ${esc(n.discovery)}</span>`:''}<span>·</span><span>${current.demo?'Sample story':'Company news'}</span><time datetime="${esc(n.publishedAt)}">${esc(date(n.publishedAt))}</time></div><h4>${link(current.demo?null:n.url,esc(n.headline)+(current.demo?'':' <span aria-hidden="true">↗</span>'))}</h4><p>${esc(n.summary || 'The provider did not supply a summary. Read the original source for details.')}</p><div class="news-bottom"><span class="tag">${esc(n.category ?? 'company')}</span>${n.signalReviewed?`<span class="tag ${esc(n.signal)}">${current.demo?'Sample ':''}${esc(n.signal)} evidence</span>`:''}${current.demo?'<span class="read-link">Fictional example · no article</span>':link(n.url,n.linkType==='article-redirect'?'Open article via Google News ↗':'Read article ↗','read-link')}</div></article>`).join('') : `<div class="empty-state">${all.length ? 'No stories match this filter.' : 'No matching headlines were collected from the configured RSS feeds. Expand the supplementary TradingView feed below. See source details for retrieval errors and coverage.'}</div>`);
  document.querySelectorAll('[data-news-filter]').forEach(b=>b.addEventListener('click',()=>{newsFilter=b.dataset.newsFilter;renderNews();}));
}
const formDescription = form => ({'10-K':'Annual report','10-Q':'Quarterly report','8-K':'Current report','4':'Insider ownership disclosure','3':'Initial ownership disclosure','5':'Annual ownership disclosure','6-K':'Foreign issuer report','20-F':'Foreign issuer annual report','40-F':'Canadian issuer annual report','S-3':'Securities registration','S-1':'Securities registration'}[form.replace('/A','')] ?? 'Company disclosure');
function renderFilings() {
  const all = current.filings ?? [];
  const rows = all.filter(f => filingFilter === 'all' || (filingFilter === 'insider' ? /^(3|4|5)(\/A)?$/.test(f.form) : f.form.startsWith(filingFilter)));
  $('#filings-panel').innerHTML = `<div class="panel-header"><div><h3>SEC filings <span class="count-pill">${all.length}</span></h3><p>${current.demo?'Sample filings · educational explanations':'Official filing metadata · filing date, Eastern Time'}</p></div>${link(`https://www.sec.gov/edgar/browse/?CIK=${encodeURIComponent(current.cik || current.symbol)}`,'EDGAR ↗','read-link')}</div><div class="filing-filters">${[['all','All filings'],['10-','10-K / 10-Q'],['8-K','8-K'],['insider','Insider']].map(([key,label])=>`<button class="filter-button ${filingFilter===key?'active':''}" data-filing-filter="${key}" aria-pressed="${filingFilter===key}">${label}</button>`).join('')}</div>` + (rows.length ? rows.map(f=>`<article class="filing-row" id="filing-${esc(f.id)}"><span class="form-label">${esc(f.form)}</span><div><h4>${link(current.demo?null:f.url,esc(formDescription(f.form)))}</h4><p>Filed ${esc(date(f.filedAt+'T12:00:00Z'))}${f.items?' · Items '+esc(f.items):''}${current.demo?' · Sample':''}</p><div class="filing-insight"><strong>What this means</strong><p>${esc(filingInsight(f))}</p><small>Explanation based on form and item codes; document contents have not been analyzed.</small></div></div>${current.demo?'':link(f.url,'↗','filing-link')}</article>`).join('') : '<div class="empty-state">SEC collection is not configured for this ticker. Open EDGAR above to read its filings. This does not mean the company has no filings.</div>');
  document.querySelectorAll('[data-filing-filter]').forEach(b=>b.addEventListener('click',()=>{filingFilter=b.dataset.filingFilter;renderFilings();}));
}
function renderAssessment() {
  const b=evidenceBrief(current);
  const refs=items=>items.map(n=>`<p class="case-text">${link(n.url,esc(n.headline))} <small>${esc(n.source)} · ${date(n.publishedAt)}</small></p>`).join('');
  const section=(title,key)=>`<div class="assessment-case"><div class="case-label">${title}</div>${b.themes.length?b.themes.map(t=>`<p class="case-text"><strong>${esc(t.label)}:</strong> ${esc(t[key])}</p>${refs(t.items)}`).join(''):'<p class="case-text">No supported topic was identified in the collected excerpts. No directional case is inferred.</p>'}</div>`;
  $('#assessment-panel').innerHTML=`<div class="panel-header"><div><div class="panel-eyebrow">THE BIGGER PICTURE</div><h3>Overall assessment</h3></div><span class="sentiment-badge neutral">${b.label}</span></div><div class="assessment-body"><p class="assessment-summary">${esc(b.description)}</p><p class="case-text"><strong>Sentiment: not rated.</strong> Topic matching identifies what to investigate; it cannot establish positive or negative business impact. Confidence: limited. ${b.asOf?'Newest collected story: '+date(b.asOf)+'.':''}</p>${section('Bull case — conditions to verify','bull')}${section('Bear case — conditions to verify','bear')}${section('Catalysts and checks','check')}<div class="assessment-case"><div class="case-label">Key risks & gaps</div><p class="case-text">Earnings timing, market reaction, valuation, industry and macro coverage remain unverified. ${b.failures.length} source requests failed for this collection scope. The TradingView embed is not part of this brief. Matching an excerpt to a company does not prove the company is the main subject of the article.</p></div>${b.news.length&&!b.themes.length?refs(b.news.slice(0,5)):''}</div><div class="assessment-foot">Free topic rules · headlines and excerpts only · Not financial advice</div>`;
}

async function boot() {
  try {
    [manifest, directory, publicNews] = await Promise.all([json('./data/manifest.json'),json('./data/directory.json'),json('./data/public-news.json').catch(()=>({bySymbol:{},sources:[]}))]);
    if (manifest.schemaVersion !== 1 || !Array.isArray(directory)) throw new Error('Invalid data bundle');
    renderBanner(); renderQuick(); $('#ticker-input').placeholder = `Search ${directory.length.toLocaleString()} US stock tickers or companies…`; route();
  } catch {
    $('#research').innerHTML = '<section class="panel empty-state"><h3>The research workspace could not load</h3><p>Serve this folder over HTTP, or check that all site files were included in the deployment.</p><button class="subtle-button" id="retry-boot">Try again</button></section>';
    $('#retry-boot').addEventListener('click',boot);
  }
}
boot();

