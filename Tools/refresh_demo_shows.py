#!/usr/bin/env python3
"""Build a bounded show preview from the graph-exported person previews.

The browser demo ships capped appearances per person. Only those appearances
belong in its show previews; the full graph remains in the iPhone app.
"""
import json
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
DATA = SITE / 'demo' / 'data'
MIN_EPISODES = 8
EPISODE_CAP = 30


def main():
    people_paths = sorted((DATA / 'p').glob('*.json'))
    write_json(DATA / 'people.json', [path.stem for path in people_paths])
    previous = {show['id']: show for show in json.loads((DATA / 'shows.json').read_text())}
    shows = {}
    for path in people_paths:
        person = json.loads(path.read_text())
        for episode in person['episodes']:
            if episode.get('ai'):
                continue
            meta = person['showList'][episode['s']]
            show = shows.setdefault(meta['id'], {
                **meta, 'lang': previous.get(meta['id'], {}).get('lang', ''), 'episodes': {},
            })
            row = show['episodes'].get(episode['id'])
            if row is None:
                row = {key: value for key, value in episode.items() if key not in {'s', 'g', 'ai'}}
                row['p'] = []
                show['episodes'][episode['id']] = row
            if episode['g'] == 'f' and person['slug'] not in row['p'] and len(row['p']) < 3:
                row['p'].append(person['slug'])
    output = DATA / 's'
    output.mkdir(exist_ok=True)
    index, expected = [], set()
    for sid, show in shows.items():
        rows = sorted(show.pop('episodes').values(), key=lambda row: row['d'], reverse=True)
        if len(rows) < MIN_EPISODES:
            continue
        item = {**show, 'n': len(rows)}
        filename = sid + '.json'
        expected.add(filename)
        write_json(output / filename, {**item, 'episodes': rows[:EPISODE_CAP]})
        index.append(item)
    write_json(DATA / 'shows.json', sorted(index, key=lambda show: (-show['n'], show['t'])))
    for path in output.glob('*.json'):
        if path.name not in expected:
            path.unlink()
    print(f'{len(index)} show previews from {len(list((DATA / "p").glob("*.json")))} graph-exported people')


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    main()
