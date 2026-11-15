import { normalizeTicker, searchDirectory, safeUrl, freshness, dedupeNews, assess } from './lib/research.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = (url, label, cls = '') => safeUrl(url) ? `<a class="${cls}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>` : `<span>${label}</span>`;
const date = value => { const d = new Date(value); return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'}).format(d) : 'Date unavailable'; };
const number = (n, options = {}) => n !== null && n !== undefined && Number.isFinite(Number(n)) ? new Intl.NumberFormat('en-US', options).format(n) : '—';
const store = {get(key, fallback) {try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;}},set(key,value) {try {localStorage.setItem(key,JSON.stringify(value));} catch { /* Browsing without persistence is supported. */ }}};
let manifest, directory = [], current = null, activeSuggestion = -1, suggestions = [], generation = 0, newsFilter = 'all', filingFilter = 'all';
let watchlist = store.get('signaldesk-watchlist', []);
if (!Array.isArray(watchlist)) watchlist = [];
watchlist = watchlist.filter(x => normalizeTicker(x) === x);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#theme-toggle').textContent = theme === 'dark' ? '☀' : '☾';
  $('#theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  store.set('signaldesk-theme', theme);
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
  openDialog('Sources & methodology', `<p>Signal Desk brings source material into one place for <strong>US-listed, long-only equity research</strong>. The initial holding-period lens is 2–5 trading days.</p>
  <h3>What is included in this MVP</h3><p>Validated ticker search, company news, SEC filing links, a basic evidence summary, a local watchlist, and light/dark themes. Industry and macro analysis are planned for the next stage.</p>
  <h3>Sample data versus collected data</h3><p>Demo snapshots are fictional UI examples. Their prices, stories, filing rows, and sentiment must not be used as market information. A collection run replaces demo files with dated API snapshots. The browser reads only static JSON.</p>
  <h3>Assessment rules</h3><p>News is deduplicated by headline and limited to the latest seven calendar days. Positive/negative labels require explicitly reviewed directional evidence. Finnhub news is not automatically reviewed; its presence alone cannot produce a bullish or bearish label. Neutral with insufficient evidence is a coverage limitation. Form 4 does not automatically mean an insider bought or sold shares. A filing type does not establish financial results or wrongdoing.</p>
  <h3>Refresh and coverage</h3><p>Only tickers configured in <code>config.json</code> get research snapshots. The wider directory enables autocomplete; a valid listing may not yet have a snapshot. Refresh checks the latest deployed files; it does not trigger an API collection. Data older than ${esc(manifest?.staleAfterHours ?? 24)} hours is visibly marked stale. Scheduled Actions can run late.</p>
  <h3>Source access</h3><p>${link('https://www.sec.gov/search-filings/edgar-application-programming-interfaces','SEC EDGAR')} provides filing metadata. ${link('https://finnhub.io/terms-of-service','Finnhub')} can supply optional company news, profile, quote, and earnings data only when public display rights have been confirmed. No keys are stored in the site. Missing prices or earnings dates remain unknown.</p>
  <h3>Your earnings rule</h3><p>The lens flags an upcoming earnings event inside seven calendar days. It cannot clear a stock for an earnings-free holding period; verify the date with the issuer before entering a position.</p><p><strong>Not financial advice.</strong> This app does not issue buy or sell orders, assess suitability, or perform halal screening.</p>`);
}
$('#open-method').addEventListener('click', methodology);

function showWatchlist() {
  openDialog('My watchlist', watchlist.length ? '<p>Saved on this browser. A saved ticker does not change the data collection schedule.</p>' + watchlist.map(symbol => `<div class="dialog-watchlist"><span><strong>${esc(symbol)}</strong> · ${esc(directory.find(x => x.symbol === symbol)?.name ?? '')}</span><button data-watch-open="${esc(symbol)}">Open ↗</button></div>`).join('') : '<p>No saved companies yet. Use “Save” on a company to keep it here.</p>');
  document.querySelectorAll('[data-watch-open]').forEach(button => button.addEventListener('click', () => { $('#info-dialog').close(); navigate(button.dataset.watchOpen); }));
}
$('#open-watchlist').addEventListener('click', showWatchlist);
function renderQuick() {
  $('#watch-count').textContent = watchlist.length;
  $('#quick-tickers').innerHTML = (manifest?.tickers ?? []).slice(0, 6).map(t => `<button class="quick-ticker ${current?.symbol === t.symbol ? 'selected' : ''}" data-ticker="${esc(t.symbol)}"><span class="mini-logo">${esc(t.symbol[0])}</span><span><strong>${esc(t.symbol)}</strong><small>${esc(t.name.length > 22 ? t.name.slice(0,20)+'…' : t.name)}</small></span><span class="quick-arrow">↗</span></button>`).join('');
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
  if (!ticker) { hideSuggestions(); $('#search-error').textContent = 'Choose a US-listed company from the suggestions, or enter a supported ticker such as AAPL.'; return; }
  navigate(ticker);
});
function navigate(symbol) { hideSuggestions(); $('#ticker-input').value = symbol; $('#ticker-input').blur(); if (location.hash === `#ticker=${encodeURIComponent(symbol)}`) loadTicker(symbol); else location.hash = `ticker=${encodeURIComponent(symbol)}`; }
window.addEventListener('hashchange', route);
function route() {
  if (location.hash.startsWith('#ticker=')) { let symbol; try { symbol = normalizeTicker(decodeURIComponent(location.hash.slice(8))); } catch { symbol = null; } loadTicker(symbol); }
  else if (!current) loadTicker(manifest?.tickers?.[0]?.symbol ?? 'AAPL');
}
function renderBanner() {
  const demo = manifest.mode === 'demo';
  $('#mode-banner').classList.toggle('collected',!demo);
  $('#mode-banner').innerHTML = demo ? `<span aria-hidden="true">◉</span><span><strong>Sample workspace.</strong> Prices, news, filing rows, and assessments are fictional examples.</span><button id="data-setup">Connect real data ↗</button>` : `<span aria-hidden="true">◉</span><span><strong>Collected snapshots.</strong> Last collection attempt: ${esc(date(manifest.generatedAt))}. Each source has its own timestamp and coverage.</span><button id="data-setup">Data details ↗</button>`;
  $('#data-setup').addEventListener('click',methodology);
}

async function loadTicker(symbol) {
  const token = ++generation;
  $('#search-error').textContent = '';
  const listing = directory.find(x => x.symbol === symbol);
  if (!listing) { $('#search-error').textContent = 'This ticker is not in the current US equity directory.'; return; }
  $('#ticker-input').value = symbol;
  $('#research').innerHTML = '<div class="loading-state"><span class="loader"></span> Loading company research…</div>';
  $('#research').setAttribute('aria-busy','true');
  const available = manifest.tickers.some(x => x.symbol === symbol);
  if (!available) {
    current = {symbol}; renderQuick();
    $('#research').innerHTML = `<section class="panel empty-state"><div class="eyebrow">VALID LISTING · NO SNAPSHOT</div><h3>${esc(listing.name)} <span class="count-pill">${esc(symbol)}</span></h3><p>This company is in the US listing directory, but has not been collected yet. Add <strong>${esc(symbol)}</strong> to <code>config.json</code> and run the data-refresh workflow.</p><p>Static hosting cannot fetch a new protected API snapshot on demand. ${link(`https://www.sec.gov/edgar/browse/?CIK=${encodeURIComponent(listing.cik)}`,'Open this company on SEC EDGAR ↗')}</p></section>`;
    $('#research').removeAttribute('aria-busy'); return;
  }
  try {
    const data = await json(`./data/tickers/${encodeURIComponent(symbol)}.json`);
    if (token !== generation) return;
    if (data.symbol !== symbol || data.schemaVersion !== 1 || Boolean(data.demo) !== (manifest.mode === 'demo')) throw new Error('Snapshot validation failed');
    current = data; newsFilter = 'all'; filingFilter = 'all'; renderResearch(); renderQuick();
    document.title = `${symbol} · Signal Desk`;
  } catch {
    if (token !== generation) return;
    $('#research').innerHTML = '<section class="panel empty-state"><h3>Research snapshot unavailable</h3><p>The file could not be loaded. Your connection or the latest deployment may be incomplete.</p><button id="retry-load" class="subtle-button">Try again</button></section>';
    $('#retry-load').addEventListener('click', () => loadTicker(symbol));
  } finally { if (token === generation) $('#research').removeAttribute('aria-busy'); }
}

function sourceStamp(status) {
  if (current.demo) return 'Fictional sample';
  if (!status || status.state === 'missing') return 'Not connected';
  if (status.state === 'error') return 'Unavailable';
  const f = freshness(status.fetchedAt, Date.now(), manifest.staleAfterHours);
  return f === 'fresh' ? 'Collected' : f === 'stale' ? 'Stale' : 'Time unverified';
}
function renderResearch() {
  const d = current, p = d.profile ?? {}, q = d.quote ?? {}, m = d.metrics ?? {};
  const stamp = sourceStamp(d.sources?.market);
  const priceTime = q.asOf ? date(q.asOf) : 'Time unavailable';
  const watchSaved = watchlist.includes(d.symbol);
  $('#research').innerHTML = `
  <section class="company-card" aria-label="Company snapshot"><div class="company-top"><div class="company-heading"><div class="company-logo" aria-hidden="true">${esc(d.symbol[0])}</div><div><div class="ticker-label"><strong>${esc(d.symbol)}</strong><span> / </span><span>${esc(d.exchange)}</span></div><h2>${esc(d.name)}</h2><div class="company-meta">${esc(p.sector ?? 'Sector unavailable')}<span>·</span>${esc(p.industry ?? 'Industry unavailable')}</div></div></div><div><div class="company-tools"><button id="save-ticker" class="subtle-button ${watchSaved ? 'saved' : ''}" aria-pressed="${watchSaved}">${watchSaved ? '★ Saved' : '☆ Save'}</button><button id="refresh-ticker" class="subtle-button" title="Reload the latest deployed snapshot">↻ Refresh snapshot</button></div><div class="data-stamp">${esc(stamp)}${q.asOf ? ' · '+esc(priceTime) : ''}</div></div></div><div class="stats-grid">
  <div class="stat"><span class="stat-label">Share price · USD</span><span class="stat-value">${q.price == null ? '—' : '$'+number(q.price,{minimumFractionDigits:2,maximumFractionDigits:2})}</span><div class="stat-note ${q.changePercent > 0 ? 'positive' : q.changePercent < 0 ? 'negative' : ''}">${q.changePercent == null ? 'Quote not connected' : `${q.changePercent >= 0 ? '+' : ''}${number(q.changePercent,{maximumFractionDigits:2})}% vs. previous close${d.demo ? ' · sample' : ''}`}</div></div>
  <div class="stat"><span class="stat-label">Market cap · USD</span><span class="stat-value">${m.marketCap == null ? '—' : '$'+number(m.marketCap,{notation:'compact',maximumFractionDigits:2})}</span><div class="stat-note">${d.demo ? 'Sample value' : 'Provider reported'}</div></div>
  <div class="stat"><span class="stat-label">P/E · trailing</span><span class="stat-value">${m.pe == null ? '—' : number(m.pe,{maximumFractionDigits:1})+'×'}</span><div class="stat-note">${m.pe == null ? 'Not available' : d.demo ? 'Sample value' : 'Trailing twelve months'}</div></div>
  <div class="stat"><span class="stat-label">Revenue growth · YoY</span><span class="stat-value ${m.revenueGrowth > 0 ? 'positive' : m.revenueGrowth < 0 ? 'negative' : ''}">${m.revenueGrowth == null ? '—' : (m.revenueGrowth>0?'+':'')+number(m.revenueGrowth,{maximumFractionDigits:1})+'%'}</span><div class="stat-note">${d.demo ? 'Sample value' : m.revenueGrowth == null ? 'Not available' : 'Provider reported'}</div></div>
  <div class="stat"><span class="stat-label">Research horizon</span><span class="stat-value">2–5 <span style="font-size:12px;font-weight:500">days</span></span><div class="stat-note">Trading sessions · long-only</div></div></div></section>
  <nav class="section-tabs" aria-label="Research sections"><a href="#news-panel" class="active">Overview</a><a href="#news-panel">Company news <span>${(d.news ?? []).length}</span></a><a href="#filings-panel">SEC filings <span>${(d.filings ?? []).length}</span></a><a href="#assessment-panel">Assessment</a><a href="#next-stage">Industry & macro <span>NEXT</span></a></nav>
  <div class="content-grid"><div class="left-column"><section class="panel" id="news-panel"></section><section class="panel" id="filings-panel"></section><section class="panel stage-note" id="next-stage"><div><strong>The context beyond the company</strong><p>Peer developments, industry news, and macro drivers are planned for stage 2.</p></div><span>NEXT UP ↗</span></section></div><div class="right-column"><section class="panel assessment" id="assessment-panel"></section><section class="panel lens-card"><div class="panel-eyebrow">YOUR RESEARCH LENS</div><h3>Think in trading sessions.</h3><p>For a 2–5 day hold, focus on dated catalysts, new disclosures, and the earnings calendar.</p><div class="earnings-alert">${earningsText()}</div></section><section class="panel"><div class="panel-header"><h3>Source coverage</h3><span class="panel-eyebrow">${d.demo ? 'DEMO' : 'STATUS'}</span></div><div class="source-health">${['sec','news','market','earnings'].map(key => `<div class="health-row"><span>${({sec:'SEC EDGAR',news:'Company news',market:'Quotes & fundamentals',earnings:'Earnings calendar'})[key]}</span><span class="health-state ${['Not connected','Stale','Time unverified'].includes(sourceStamp(d.sources?.[key])) ? 'warn' : sourceStamp(d.sources?.[key]) === 'Unavailable' ? 'fail' : ''}" title="${esc(d.sources?.[key]?.fetchedAt ?? 'No collection timestamp')}">${esc(sourceStamp(d.sources?.[key]))}</span></div>`).join('')}</div></section></div></div>`;
  $('#save-ticker').addEventListener('click', () => { const symbol = d.symbol; watchlist = watchlist.includes(symbol) ? watchlist.filter(x => x !== symbol) : [...watchlist,symbol]; store.set('signaldesk-watchlist',watchlist); renderResearch(); renderQuick(); });
  $('#refresh-ticker').addEventListener('click', async () => { const button = $('#refresh-ticker'); button.disabled = true; button.textContent = 'Refreshing…'; try { manifest = await json('./data/manifest.json'); renderBanner(); await loadTicker(d.symbol); } catch { $('#search-error').textContent = 'The latest snapshot could not be checked. Please try again.'; button.disabled = false; button.textContent = '↻ Refresh snapshot'; } });
  renderNews(); renderFilings(); renderAssessment();
}
function earningsText() {
  const e = current.earnings;
  if (!e?.date) return '◷ Earnings date unverified. Check the issuer calendar before entering a position.';
  const days = (Date.parse(e.date+'T23:59:59Z')-Date.now()) / 86400000;
  return `${current.demo ? 'Sample event · ' : ''}${days >= 0 ? 'Upcoming' : 'Last reported'} earnings: ${esc(date(e.date+'T12:00:00Z'))}${days >= 0 && days <= 7 ? ' · Inside a 7-day event window. Review before entering.' : '. Verify the timing with the issuer.'}`;
}
function renderNews() {
  const all = dedupeNews(current.news ?? []);
  const items = all.filter(n => newsFilter === 'all' || n.category === newsFilter);
  $('#news-panel').innerHTML = `<div class="panel-header"><div><h3>Company news <span class="count-pill">${all.length}</span></h3><p>${current.demo ? 'Illustrative stories · not actual reporting' : 'Provider summaries · newest first'}</p></div><div class="news-controls" aria-label="Filter news">${[['all','All news'],['earnings','Earnings'],['company','Company']].map(([key,label])=>`<button class="filter-button ${newsFilter===key?'active':''}" data-news-filter="${key}" aria-pressed="${newsFilter===key}">${label}</button>`).join('')}</div></div>` + (items.length ? items.map(n=>`<article class="news-item" id="news-${esc(n.id)}"><div class="news-meta"><span class="source-dot">${esc(n.source?.[0] ?? 'N')}</span><span>${esc(n.source)}</span><span>·</span><span>${current.demo?'Sample story':'Company news'}</span><time datetime="${esc(n.publishedAt)}">${esc(date(n.publishedAt))}</time></div><h4>${link(n.url,esc(n.headline)+' <span aria-hidden="true">↗</span>')}</h4><p>${esc(n.summary || 'The provider did not supply a summary. Read the original source for details.')}</p><div class="news-bottom"><span class="tag">${esc(n.category ?? 'company')}</span>${n.signalReviewed?`<span class="tag ${esc(n.signal)}">${current.demo?'Sample ':''}${esc(n.signal)} evidence</span>`:''}${link(n.url,current.demo?'Open company newsroom ↗':'Read source ↗','read-link')}</div></article>`).join('') : `<div class="empty-state">${all.length ? 'No stories match this filter.' : 'Company news is not available in this snapshot. The collector can add a licensed news provider; no stories or sentiment have been invented.'}</div>`);
  document.querySelectorAll('[data-news-filter]').forEach(b=>b.addEventListener('click',()=>{newsFilter=b.dataset.newsFilter;renderNews();}));
}
const formDescription = form => ({'10-K':'Annual report','10-Q':'Quarterly report','8-K':'Current report','4':'Insider ownership disclosure','3':'Initial ownership disclosure','5':'Annual ownership disclosure','6-K':'Foreign issuer report','20-F':'Foreign issuer annual report','40-F':'Canadian issuer annual report','S-3':'Securities registration','S-1':'Securities registration'}[form.replace('/A','')] ?? 'Company disclosure');
function renderFilings() {
  const all = current.filings ?? [];
  const rows = all.filter(f => filingFilter === 'all' || (filingFilter === 'insider' ? /^(3|4|5)(\/A)?$/.test(f.form) : f.form.startsWith(filingFilter)));
  $('#filings-panel').innerHTML = `<div class="panel-header"><div><h3>SEC filings <span class="count-pill">${all.length}</span></h3><p>${current.demo?'Fictional filing rows · links open the real SEC company page':'Official filing metadata · filing date, Eastern Time'}</p></div>${link(`https://www.sec.gov/edgar/browse/?CIK=${encodeURIComponent(current.cik)}`,'EDGAR ↗','read-link')}</div><div class="filing-filters">${[['all','All filings'],['10-','10-K / 10-Q'],['8-K','8-K'],['insider','Insider']].map(([key,label])=>`<button class="filter-button ${filingFilter===key?'active':''}" data-filing-filter="${key}" aria-pressed="${filingFilter===key}">${label}</button>`).join('')}</div>` + (rows.length ? rows.map(f=>`<article class="filing-row" id="filing-${esc(f.id)}"><span class="form-label">${esc(f.form)}</span><div><h4>${link(f.url,esc(formDescription(f.form)))}</h4><p>Filed ${esc(date(f.filedAt+'T12:00:00Z'))}${f.items?' · Items '+esc(f.items):''}${current.demo?' · Sample':''}</p></div>${link(f.url,'↗','filing-link')}</article>`).join('') : '<div class="empty-state">No matching filings in this snapshot. This is a bounded list of recent filings, not the complete SEC history.</div>');
  document.querySelectorAll('[data-filing-filter]').forEach(b=>b.addEventListener('click',()=>{filingFilter=b.dataset.filingFilter;renderFilings();}));
}
function renderAssessment() {
  const now = current.demo ? Date.parse(current.asOf) : Date.now();
  const a = assess(current, now);
  const evidence = (items, kind) => items.map(item=>`<p class="case-text">${esc(kind==='filing'?`${item.form} filed ${date(item.filedAt+'T12:00:00Z')}. Read the disclosure to establish its significance.`:item.headline)} <a class="evidence-link" href="#${kind==='filing'?'filing':'news'}-${esc(item.id)}">[source]</a></p>`).join('');
  $('#assessment-panel').innerHTML = `<div class="panel-header"><div><div class="panel-eyebrow">THE BIGGER PICTURE</div><h3 style="margin-top:6px">Overall assessment</h3></div><span class="sentiment-badge ${a.sentiment}"><i></i>${a.sentiment}</span></div><div class="assessment-body"><p class="assessment-summary">${current.demo?'<strong>Illustrative assessment.</strong> ':''}${esc(a.text)}</p><div class="assessment-case"><div class="case-label"><b class="positive">↗</b> Bull case</div>${a.bull.length?evidence(a.bull,'news'):'<p class="case-text">No reviewed upside drivers. Read the sources before forming a view.</p>'}</div><div class="assessment-case"><div class="case-label"><b class="negative">↘</b> Bear case</div>${a.bear.length?evidence(a.bear,'news'):'<p class="case-text">No reviewed downside drivers. Missing evidence does not establish low risk.</p>'}</div><div class="assessment-case"><div class="case-label"><b>◷</b> Catalysts to investigate</div>${a.catalysts.length?evidence(a.catalysts,'filing'):'<p class="case-text">No recent current-report catalyst identified. Verify issuer events and earnings dates.</p>'}</div><div class="assessment-case"><div class="case-label"><b class="negative">◇</b> Key risks & gaps</div><p class="case-text">${current.earnings?.date?'Earnings timing needs issuer confirmation.':'Earnings timing is unverified.'} ${a.reviewedCount?'The reviewed sample may omit important developments.':'News has not been directionally reviewed.'} Industry and macro context are not included.</p></div></div><div class="assessment-foot">${current.demo?'Sample rules demonstration':esc(a.coverage)} · No buy or sell recommendation</div>`;
}

async function boot() {
  try {
    [manifest, directory] = await Promise.all([json('./data/manifest.json'),json('./data/directory.json')]);
    if (manifest.schemaVersion !== 1 || !Array.isArray(directory)) throw new Error('Invalid data bundle');
    renderBanner(); renderQuick(); route();
  } catch {
    $('#research').innerHTML = '<section class="panel empty-state"><h3>The research workspace could not load</h3><p>Serve this folder over HTTP, or check that all site files were included in the deployment.</p><button class="subtle-button" id="retry-boot">Try again</button></section>';
    $('#retry-boot').addEventListener('click',boot);
  }
}
boot();
