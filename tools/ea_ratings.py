#!/usr/bin/env python3
"""Fetch every Madden ratings release EA has published this season into ea-ratings.json.

Uses ea_page_client.py (EA's ratings website, edition-checked on every page). Writes one compact file the site's
Admin › Madden Ratings button reads: the Launch Ratings, then each weekly release (Week 1 … Week 18) and the
playoff releases (Wild Card, Divisional, Conference Championship, Super Bowl) as EA publishes them.

Releases already in the file are kept and not fetched again (EA doesn't change a past release); the newest
release is always re-fetched in case EA revised it. --refresh fetches everything again.

    python tools/ea_ratings.py                 # edition from EA's page, output ea-ratings.json in the repo root
    python tools/ea_ratings.py --edition 27    # refuse anything but Madden 27
    python tools/ea_ratings.py --refresh
"""
import argparse
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ea_page_client import (RatingsError, RATINGS_URL, download, fetch_snapshot, now)  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'ea-ratings.json'
PLAYOFFS = [('wild', 'Wild Card'), ('divisional', 'Divisional'), ('conference|championship', 'Conference Championship'), ('super', 'Super Bowl')]
REGULAR_WEEKS = 18


def slot_for(label):
    """EA release label -> league week (0 = launch, 1-18 regular season, 19-22 playoffs), or None to skip it."""
    text = label.lower()
    if 'launch' in text:
        return 0
    week = re.search(r'week\s*(\d+)', text)
    if week and 1 <= int(week.group(1)) <= REGULAR_WEEKS:
        return int(week.group(1))
    for i, (pattern, _) in enumerate(PLAYOFFS):
        if re.search(pattern, text):
            return REGULAR_WEEKS + 1 + i
    return None


def stat_label(key):
    return re.sub(r'(?<!^)(?=[A-Z])', ' ', key).replace('_', ' ').title()


def compact(snapshot):
    """{eaId: [overall, "notes"]} with the attribute changes EA lists for this release, plus who each id is."""
    ratings, people = {}, {}
    for p in snapshot['items']:
        changes = []
        for key, stat in (p.get('stats') or {}).items():
            diff = stat.get('diff') if isinstance(stat, dict) else None
            if isinstance(diff, int) and diff:
                changes.append((abs(diff), f"{'+' if diff > 0 else ''}{diff} {stat_label(key)}"))
        changes.sort(key=lambda c: -c[0])
        ratings[str(p['id'])] = [p['overallRating'], ', '.join(c[1] for c in changes[:6])]
        # [name, position, team, college, birthdate] - college/birthdate let the site tell same-named players apart.
        people[str(p['id'])] = [f"{p['firstName']} {p['lastName']}", (p.get('position') or {}).get('shortLabel') or '',
                                (p.get('team') or {}).get('label') or '', p.get('college') or '', str(p.get('birthdate') or '')[:10]]
    return ratings, people


def detect_edition():
    html = download(RATINGS_URL)
    match = re.search(r'"slug"\s*:\s*"madden-nfl-(\d+)"', html)
    if not match:
        raise RatingsError('Could not tell which Madden edition EA is serving')
    return match.group(1)


def run(args):
    edition = args.edition or detect_edition()
    # discover() insists on exactly one Launch Ratings release and checks the edition.
    from ea_page_client import discover
    meta = discover(edition)
    old = {}
    if OUT.exists() and not args.refresh:
        try:
            old = json.loads(OUT.read_text(encoding='utf-8'))
            if old.get('edition') != str(edition):
                old = {}
        except (ValueError, OSError):
            old = {}
    if any(len(v) < 5 for v in old.get('players', {}).values()):
        old = {}  # written by an older version without college/birthdate: fetch everything again
    kept = {r['id']: r for r in old.get('releases', [])}
    people = dict(old.get('players', {}))
    releases = []
    for it in sorted(meta['iterations'], key=lambda r: (slot_for(r['label']) is None, slot_for(r['label']) or 0)):
        slot = slot_for(it['label'])
        if slot is None:
            print(f"Skipping {it['label']} ({it['id']}): not a launch, weekly or playoff release", file=sys.stderr)
            continue
        if it['id'] in kept and it['id'] != meta['current_iteration']:
            releases.append(kept[it['id']])
            continue
        print(f"Fetching {it['label']} …", file=sys.stderr)
        snap = fetch_snapshot(edition, it['id'])
        ratings, who = compact(snap)
        people.update(who)
        releases.append({'id': it['id'], 'label': it['label'], 'week': slot, 'fetchedAt': snap['fetched_at'],
                         'total': snap['totalItems'], 'ratings': ratings})
    if not any(r['week'] == 0 for r in releases):
        raise RatingsError('No Launch Ratings release; nothing to compare the weeks against')
    data = {'schema': 'nbf-ea-ratings', 'version': 1, 'edition': str(edition), 'gameSlug': meta['game_slug'],
            'source': RATINGS_URL, 'updatedAt': now(), 'currentIteration': meta['current_iteration'],
            'releases': sorted(releases, key=lambda r: r['week']), 'players': people}
    text = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
    def same(a, b):  # ignore fetch times so an unchanged release doesn't cause a new commit
        strip = lambda d: {**d, 'updatedAt': None, 'releases': [{**r, 'fetchedAt': None} for r in d.get('releases', [])]}
        return json.dumps(strip(a), sort_keys=True) == json.dumps(strip(b), sort_keys=True)
    if old and same(old, data):
        print('No new EA ratings.', file=sys.stderr)
        return 0
    OUT.write_text(text + '\n', encoding='utf-8')
    print(f"Wrote {OUT.name}: {', '.join(r['label'] for r in data['releases'])} ({len(people)} players).", file=sys.stderr)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--edition', help='Madden edition number (e.g. 27). Default: whatever EA is serving')
    parser.add_argument('--refresh', action='store_true', help='Fetch every release again')
    args = parser.parse_args(argv)
    try:
        return run(args)
    except (RatingsError, OSError, ValueError, KeyError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
