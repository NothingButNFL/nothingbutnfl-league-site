"""Read the same edition-tagged Next.js data served by EA's ratings website.

The legacy drop-api route can serve older edition records even while ea.com
shows the new game. Page metadata, advertised iterations, pagination totals,
and every player's iteration must agree before a result can be used.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import math
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

RATINGS_URL = 'https://www.ea.com/games/madden-nfl/ratings'


class RatingsError(RuntimeError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def download(url):
    for attempt in range(3):
        try:
            req = Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; RamsRatings/1.0)', 'Accept': 'text/html'})
            with urlopen(req, timeout=45) as response:
                return response.read().decode('utf-8')
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            if isinstance(error, HTTPError) and error.code not in (429,500,502,503,504):
                raise RatingsError(f'EA request failed: {error}') from error
            if attempt == 2:
                raise RatingsError(f'EA request failed after 3 attempts: {error}') from error
            time.sleep(attempt + 1)


def page_url(iteration=None, page=1):
    query = {'page': page}
    if iteration:
        query['iteration'] = iteration
    return RATINGS_URL + '?' + urlencode(query)


def parse_page(html, edition):
    match = re.search(r'<script[^>]*\bid="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not match:
        raise RatingsError('EA did not provide __NEXT_DATA__; page format changed or access blocked')
    try:
        props = json.loads(match.group(1))['props']['pageProps']
        game = props['gameDetails']['slug']
        details = props['ratingDetails']
        iterations = props['ratingsFilters']['iterations']
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise RatingsError('EA page schema changed; expected gameDetails/ratingDetails/ratingsFilters') from error
    if game != f'madden-nfl-{edition}':
        raise RatingsError(f'Requested Madden {edition}, but EA page serves {game}; refusing cross-edition data')
    if not isinstance(details.get('items'), list) or type(details.get('totalItems')) is not int or details['totalItems'] < 1:
        raise RatingsError('EA page has empty or invalid ratings metadata')
    if not isinstance(iterations, list) or not iterations:
        raise RatingsError('EA page has no advertised iteration list')
    return props


def validate_items(items, iteration):
    for item in items:
        if not isinstance(item, dict) or item.get('id') is None:
            raise RatingsError('Player record is missing a stable id')
        if (item.get('iteration') or {}).get('id') != iteration:
            raise RatingsError(f'EA returned a different iteration than {iteration}')
        overall = item.get('overallRating')
        if type(overall) is not int or not 0 <= overall <= 99:
            raise RatingsError(f'Invalid overall for player {item["id"]}: {overall}')
        if not item.get('firstName') or not item.get('lastName'):
            raise RatingsError(f'Player {item["id"]} is missing a name')


def discover(edition, transport=download):
    props = parse_page(transport(RATINGS_URL), edition)
    iterations = props['ratingsFilters']['iterations']
    launch = [r['id'] for r in iterations if r.get('label','').lower() == 'launch ratings']
    if len(launch) != 1:
        raise RatingsError('Could not identify one explicitly labeled Launch Ratings baseline; no week-1 proxy allowed')
    items = props['ratingDetails']['items']
    if not items:
        raise RatingsError('EA current page returned no players')
    current = (items[0].get('iteration') or {}).get('id')
    validate_items(items, current)
    if current not in {r['id'] for r in iterations}:
        raise RatingsError('Default current iteration is absent from the advertised filters')
    return {'edition': str(edition), 'game_slug': props['gameDetails']['slug'],
            'launch_iteration': launch[0], 'current_iteration': current,
            'iterations': iterations, 'source': RATINGS_URL, 'discovered_at': now()}


def fetch_snapshot(edition, iteration, transport=download, workers=4):
    first = parse_page(transport(page_url(iteration)), edition)
    advertised = {r['id'] for r in first['ratingsFilters']['iterations']}
    if iteration not in advertised:
        raise RatingsError(f'Iteration {iteration!r} is not advertised for this edition')
    details = first['ratingDetails']
    total = details['totalItems']
    page_size = len(details['items'])
    if not page_size:
        raise RatingsError('Empty first page')
    pages = math.ceil(total / page_size)
    if pages > 100:
        raise RatingsError(f'Unexpected page count: {pages}')
    validate_items(details['items'], iteration)
    players = list(details['items'])
    def get_page(number):
        props = parse_page(transport(page_url(iteration, number)), edition)
        other = props['ratingDetails']
        if other['totalItems'] != total:
            raise RatingsError('EA totalItems changed during pagination; retry the complete fetch')
        expected = min(page_size, total - (number - 1) * page_size)
        if len(other['items']) != expected:
            raise RatingsError(f'Page {number}: expected {expected} rows, got {len(other["items"])}')
        validate_items(other['items'], iteration)
        return other['items']
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for items in pool.map(get_page, range(2, pages + 1)):
            players.extend(items)
    if len(players) != total:
        raise RatingsError(f'Incomplete fetch: {len(players)} of {total}')
    if len({p['id'] for p in players}) != total:
        raise RatingsError('Duplicate player ids across EA pages; pagination repeated or shifted')
    return {'schema_version':1, 'edition':str(edition), 'game_slug':f'madden-nfl-{edition}',
            'source':RATINGS_URL, 'iteration':iteration,
            'iteration_label':next(r['label'] for r in first['ratingsFilters']['iterations'] if r['id']==iteration),
            'fetched_at':now(), 'pages':pages, 'totalItems':total, 'items':players,
            'sha256':digest(players)}


def digest(items):
    return hashlib.sha256(json.dumps(items,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def validate_snapshot(snapshot, edition, iteration):
    if snapshot.get('edition') != str(edition) or snapshot.get('game_slug') != f'madden-nfl-{edition}':
        raise RatingsError('Cached snapshot edition mismatch')
    if snapshot.get('iteration') != iteration or snapshot.get('source') != RATINGS_URL:
        raise RatingsError('Cached snapshot provenance mismatch')
    items = snapshot.get('items',[])
    if len(items) != snapshot.get('totalItems') or not items or len({p['id'] for p in items}) != len(items):
        raise RatingsError('Cached snapshot is incomplete or has duplicate ids')
    validate_items(items, iteration)
    if snapshot.get('sha256') != digest(items):
        raise RatingsError('Cached snapshot checksum mismatch')
    return snapshot
