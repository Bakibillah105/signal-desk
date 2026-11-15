import sys
import unittest
import datetime as dt
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from benzinga import collect_news

class BenzingaTests(unittest.TestCase):
    def test_preserves_article_url_and_unreviewed_evidence(self):
        class Fake:
            def request(self,url):
                self.url=url
                return [None, {'created':None}, {'created':(dt.datetime.now(dt.timezone.utc)-dt.timedelta(minutes=1)).isoformat(), 'title':'An earnings release', 'teaser':'Revenue changed. Details in the release.', 'url':'https://www.benzinga.com/news/26/11/123/example'}]
        fake=Fake()
        rows=collect_news(fake,'AAPL','offline-test-token')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['url'],'https://www.benzinga.com/news/26/11/123/example')
        self.assertEqual(rows[0]['source'],'Benzinga')
        self.assertFalse(rows[0]['signalReviewed'])
        self.assertIn('tickers=AAPL',fake.url)
        self.assertNotIn('offline-test-token',str(rows))

if __name__=='__main__': unittest.main()
