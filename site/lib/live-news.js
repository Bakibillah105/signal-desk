export function tradingViewSymbol(listing) {
  const exchange = {'Nasdaq':'NASDAQ','NYSE':'NYSE','NYSE American':'AMEX','NYSE Arca':'AMEX','Cboe':'CBOE','IEX':'IEX'}[listing.exchange];
  if (!exchange || !/^[A-Z]{1,5}(\.[A-Z])?$/.test(listing.symbol)) return null;
  return `${exchange}:${listing.symbol.replace('.','.')}`;
}

export function mountLiveNews(container, listing, theme='light') {
  const symbol=tradingViewSymbol(listing);
  if (!symbol) {container.textContent='This exchange is not supported by the embedded feed.';return;}
  const wrapper=document.createElement('div');
  wrapper.className='tradingview-widget-container';
  const frame=document.createElement('div');
  frame.className='tradingview-widget-container__widget';
  const credit=document.createElement('div');
  credit.className='tradingview-widget-copyright';
  const anchor=document.createElement('a');
  anchor.href=`https://www.tradingview.com/symbols/${symbol.replace(':','-')}/news/`;
  anchor.target='_blank'; anchor.rel='noopener nofollow'; anchor.textContent=`${listing.symbol} news by TradingView`;
  credit.append(anchor);
  const script=document.createElement('script');
  script.type='text/javascript';script.async=true;
  script.src='https://s3.tradingview.com/external-embedding/embed-widget-timeline.js';
  script.textContent=JSON.stringify({feedMode:'symbol',symbol,displayMode:'regular',colorTheme:theme,isTransparent:false,locale:'en',width:'100%',height:660});
  script.onerror=()=>{frame.textContent='The news provider could not load. Open the TradingView news link below, or retry.';};
  wrapper.append(frame,credit,script);container.replaceChildren(wrapper);
}
