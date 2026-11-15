"""Collect public RSS headlines and links. No full-article scraping or credentials.

Source failures are recorded separately from successful feeds with no matches.
The feed index is deliberately distinct from quote/SEC/API snapshots.
"""
import concurrent.futures
import datetime as dt
import hashlib
import html
import json
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
UTC=dt.timezone.utc

def clean(value):
    return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]*>',' ',value or ''))).strip()

def parse_feed(raw,source,host):
    root=ET.fromstring(raw)
    if root.tag.split('}')[-1] not in {'rss','feed','RDF'}:
        raise ValueError('Not a news feed')
    result=[]
    # Some feeds put RSS elements in a namespace.
    for element in root.iter(): element.tag=element.tag.split('}')[-1]
    for item in root.findall('.//item'):
        title=clean(item.findtext('title'))
        url=clean(item.findtext('link'))
        parsed=urllib.parse.urlsplit(url)
        if not title or parsed.scheme not in {'http','https'} or not (parsed.hostname==host or (parsed.hostname or '').endswith('.'+host)) or parsed.path in {'','/'}:
            continue
        try:
            date=parsedate_to_datetime(item.findtext('pubDate')).astimezone(UTC)
        except (TypeError,ValueError,AttributeError):
            try: date=dt.datetime.fromisoformat((item.findtext('pubDate') or item.findtext('date') or '').replace('Z','+00:00')).astimezone(UTC)
            except (TypeError,ValueError,AttributeError): continue
        if not 0 <= (dt.datetime.now(UTC)-date).total_seconds() <= 14*86400:
            continue
        # Short RSS excerpt only, never fetch or reproduce article bodies.
        summary=clean(item.findtext('description'))
        words=summary.split()
        summary=' '.join(words[:28])+('…' if len(words)>28 else '')
        result.append({'id':'rss-'+hashlib.sha256(url.encode()).hexdigest()[:16], 'headline':title[:250], 'summary':summary, 'url':url, 'source':source, 'publishedAt':date.isoformat(), 'category':'company', 'signal':'neutral','signalReviewed':False})
    return result

def company_key(name):
    value=re.split(r'\b(?:Common|Class|Ordinary|American Deposit|ADS|ADR)\b',name,flags=re.I)[0]
    value=re.sub(r'\b(?:incorporated|corporation|company|inc|corp|ltd|limited|holdings|plc)\b\.?','',value,flags=re.I)
    return re.sub(r'\s+',' ',value).strip(' ,.-')

def related(item,listing):
    title=item['headline']; text=title+' '+item['summary']; symbol=listing['symbol']
    # Never match a short ticker such as A, IT or ON as an ordinary word.
    explicit=re.search(r'(?:\$|(?:NASDAQ|NYSE|AMEX)\s*:\s*)'+re.escape(symbol)+r'\b',text,re.I)
    name=company_key(listing['name'])
    named=len(name)>=4 and re.search(r'(?<!\w)'+re.escape(name)+r'(?!\w)',text,re.I)
    long_symbol=re.search(r'\('+re.escape(symbol)+r'\)',title)
    return bool(explicit or named or long_symbol)

def fetch_feed(spec):
    name,url,host=spec
    now=dt.datetime.now(UTC).isoformat()
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'SignalDesk RSS reader (+https://github.com/Bakibillah105/signal-desk)','Accept':'application/rss+xml, application/xml, text/xml'})
        with urllib.request.urlopen(request,timeout=18) as response:
            raw=response.read(3000000)
        rows=parse_feed(raw,name,host)
        return rows,{'source':name,'state':'ok','count':len(rows),'fetchedAt':now,'feedUrl':url}
    except Exception as exc:
        code=getattr(exc,'code',None)
        return [],{'source':name,'state':'error','reason':f'HTTP {code}' if code else 'Feed unavailable or invalid','fetchedAt':now,'feedUrl':url}

def main():
    directory=json.loads((ROOT/'site/data/directory.json').read_text(encoding='utf-8'))
    config=json.loads((ROOT/'config.json').read_text(encoding='utf-8'))
    specs=[('Investing.com','https://www.investing.com/rss/news_25.rss','investing.com'),('Benzinga','https://www.benzinga.com/feed','benzinga.com')]
    # These public symbol feeds are collected for the configured research universe.
    # The live embedded feed in the UI handles arbitrary on-demand symbol selection.
    for symbol in config['tickers']:
        specs.append(('Nasdaq','https://www.nasdaq.com/feed/rssoutbound?symbol='+urllib.parse.quote(symbol),'nasdaq.com'))
    all_items={}; statuses=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for rows,status in executor.map(fetch_feed,specs):
            statuses.append(status)
            for row in rows: all_items[row['url']]=row
    by_symbol={}
    for listing in directory:
        matched=[n for n in all_items.values() if related(n,listing)]
        if matched: by_symbol[listing['symbol']]=sorted(matched,key=lambda n:n['publishedAt'],reverse=True)[:20]
    result={'generatedAt':dt.datetime.now(UTC).isoformat(),'sources':statuses,'bySymbol':by_symbol,'scope':'Recent public RSS excerpts; company-name and explicit ticker matches. Not exhaustive coverage.'}
    (ROOT/'site/data/public-news.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'sources':statuses,'uniqueArticles':len(all_items),'matchedTickers':len(by_symbol)}))

if __name__=='__main__': main()
