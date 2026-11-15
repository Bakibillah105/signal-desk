"""Optional licensed Benzinga feed. Never print request URLs containing tokens."""
import datetime as dt
from email.utils import parsedate_to_datetime
from urllib.parse import urlencode
from collect import normalize_news

def collect_news(fetcher, symbol, token, days=7, limit=20):
    end = dt.datetime.now(dt.timezone.utc)
    start = end-dt.timedelta(days=days)
    params = {'token':token, 'tickers':symbol, 'dateFrom':str(start.date()), 'dateTo':str(end.date()), 'pageSize':min(limit,100), 'displayOutput':'abstract', 'sort':'created:desc'}
    raw = fetcher.request('https://api.benzinga.com/api/v2/news?' + urlencode(params))
    if not isinstance(raw,list):
        raise RuntimeError('Unexpected Benzinga response')
    mapped=[]
    for item in raw:
        if not isinstance(item,dict):
            continue
        try:
            timestamp=parsedate_to_datetime(item['created']).timestamp()
        except (ValueError,TypeError,KeyError,AttributeError):
            try:
                timestamp=dt.datetime.fromisoformat(item['created'].replace('Z','+00:00')).timestamp()
            except (ValueError,TypeError,KeyError,AttributeError):
                continue
        mapped.append({'headline':item.get('title'), 'summary':item.get('teaser'), 'url':item.get('url'), 'source':'Benzinga', 'datetime':timestamp})
    return normalize_news(mapped,start,end,limit)
