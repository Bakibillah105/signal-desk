export function tradingViewSymbol(listing) {
  const exchange = {'Nasdaq':'NASDAQ','NYSE':'NYSE','NYSE American':'AMEX','NYSE Arca':'AMEX','Cboe':'CBOE','IEX':'IEX'}[listing.exchange];
  if (!exchange || !/^[A-Z]{1,5}(\.[A-Z])?$/.test(listing.symbol)) return null;
  return `${exchange}:${listing.symbol}`;
}

export function mountLiveNews(container, listing, theme='light') {
  const symbol=tradingViewSymbol(listing);
  if (!symbol) {container.textContent='This exchange is not supported by the embedded feed.';return;}
  const widget=document.createElement('tv-news-feed');
  widget.setAttribute('symbol',symbol);
  widget.setAttribute('news-type','all');
  widget.setAttribute('show-daily-summary','');
  widget.setAttribute('theme',theme);
  widget.style.cssText='display:block;width:100%;height:700px';
  container.replaceChildren(widget);
  if (!document.querySelector('#tradingview-news-module')) {
    const script=document.createElement('script');
    script.id='tradingview-news-module';script.type='module';
    script.src='https://widgets.tradingview-widget.com/w/en/tv-news-feed.js';
    script.onerror=()=>{container.textContent='The news provider could not load. Open the TradingView news link above, or retry.';script.remove();};
    document.head.append(script);
  }
}
