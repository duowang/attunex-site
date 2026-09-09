import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {graphLayout, evidenceGroups, searchPeople, safeURL, NODE_PITCH} from '../explore/graph-model.js';
const dataDir = new URL('../explore/data/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', dataDir)));

test('every published connection is drawable and retains its own playable evidence', () => {
  assert(index.people.length > 0);
  for (const p of index.people) {
    const payload = JSON.parse(readFileSync(new URL(`p/${p.id}.json`, dataDir)));
    const layout = graphLayout(payload);
    assert.equal(layout.nodes.length, 1 + layout.shownShows.length + payload.connections.length);
    assert.equal(layout.shownShows.length + layout.hiddenShows, payload.shows.length,
      `${p.id}: every show is either drawn or counted as hidden`);
    for (const c of payload.connections) {
      assert(layout.edges.some(e => e.personID === c.person.id && e.showID === c.showID));
      const groups = evidenceGroups(c, payload.person);
      assert(groups.every(g => g.episodes.length));
      if (c.kind === 'shared_episode') assert.equal(groups.length, 1);
      else {
        assert.equal(groups[0].title, `Featuring ${payload.person.name}`);
        assert.equal(groups[1].title, `Featuring ${c.person.name}`);
      }
    }
    for (const n of layout.nodes) assert(n.y >= 60 && n.y <= layout.height - 60);
    // Staying inside the box is not the same as being readable. Nodes render
    // ~120px tall, and the show column once stacked 100 of them 4px apart
    // inside a 654px graph because the height was sized on the people column
    // alone. Assert the pitch per column, which is the thing that broke.
    for (const kind of ['show', 'person']) {
      const ys = layout.nodes.filter(n => n.kind === kind).map(n => n.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++)
        assert(ys[i] - ys[i - 1] >= NODE_PITCH - 1,
          `${p.id}: ${kind} nodes ${(ys[i] - ys[i - 1]).toFixed(1)}px apart, need ${NODE_PITCH}`);
    }
  }
});
test('the shipped sample flags exactly the neighbors it does not publish', () => {
  // The client swaps the recenter button for the App Store on `expandable: false`. If the
  // flag and the shipped set ever disagree, one direction 404s and the other hides a
  // neighborhood that is right there, so assert they are the same set both ways.
  const shipped = new Set(index.people.map(p => p.id));
  assert.equal(shipped.size, index.coverage.shippedPeople);
  assert(index.coverage.graphPeople > shipped.size, 'a sample must be smaller than the graph');
  let terminal = 0;
  for (const p of index.people) {
    const payload = JSON.parse(readFileSync(new URL(`p/${p.id}.json`, dataDir)));
    for (const c of payload.connections) {
      const publishes = shipped.has(c.person.id);
      assert.equal(c.expandable === false, !publishes, `${p.id} -> ${c.person.id}`);
      if (!publishes) terminal++;
    }
  }
  assert(terminal > 0, 'a sample should have edges that leave it');
});
test('shared episode evidence is an intersection, never unrelated appearances', () => {
  const a = {audioURL:'https://example.com/a.mp3'}, b = {audioURL:'https://example.com/b.mp3'};
  const c = {kind:'shared_episode', sourceAppearances:[a,b], appearances:[b,b]};
  assert.deepEqual(evidenceGroups(c, {name:'Source'})[0].episodes, [b]);
});
test('search handles accents, multiple terms and exact name ranking', () => {
  const people = [{name:'René Test',description:'Scientist'}, {name:'Test Person',description:'René studies'}];
  assert.equal(searchPeople(people,'rene')[0].name, 'René Test');
  assert.equal(searchPeople(people,'test person')[0].name, 'Test Person');
  assert.equal(searchPeople(people,'scientist rene').length, 1);
  assert.equal(searchPeople(people,'missing').length, 0);
});
test('media and external links reject active URL schemes', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', undefined, '']) assert.equal(safeURL(url), '');
  assert.equal(safeURL('https://example.com/a.mp3'), 'https://example.com/a.mp3');
});
