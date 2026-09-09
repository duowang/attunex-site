/* Pure graph geometry and evidence selection, shared with focused node tests. */
export function safeURL(value) {
  if (typeof value !== 'string') return '';
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
export function searchPeople(people, query) {
  const normalize = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = normalize(query.trim());
  if (!q) return people;
  return people.map((p, order) => ({p, order, name:normalize(p.name), haystack:normalize(`${p.name} ${p.description || ''}`)}))
    .filter(row => q.split(/\s+/).every(word => row.haystack.includes(word)))
    .sort((a,b) => (b.name === q) - (a.name === q) || Number(b.name.startsWith(q)) - Number(a.name.startsWith(q)) || a.order - b.order).map(row => row.p);
}
export const NODE_PITCH = 94;   // vertical room one node needs; nodes render ~120px tall
// Each column starts and ends at its own inset, so the two need different
// heights to hold the same node count. Deriving the height from one column's
// count and spending it at the other's insets is how the show column ended up
// tighter than the pitch even once it was counted.
const SHOW_TOP = 112, SHOW_INSET = 214;      // 112 above, 102 below
const PERSON_TOP = 80, PERSON_INSET = 185;   // 80 above, 105 below
const spanFor = (count, inset) => count > 1 ? inset + (count - 1) * NODE_PITCH : 0;
export function graphLayout(payload) {
  // People occupy one ordered column; show anchors stay spaced independently.
  // Each edge lives strictly between adjacent columns, away from other nodes.
  //
  // Only shows that carry a connection get a node. The middle column is the
  // route from the starting point to someone new, so a show nobody is reached
  // through is a dead end — and there are a lot of them: a well-covered person
  // appears on ~100 shows while at most a handful lead anywhere. Laying all of
  // them out stacked 100 nodes 4px apart in a 654px column — not a crowded map
  // so much as no map at all. `hiddenShows` is what the caller states instead.
  const groups = payload.shows.map(show => ({show, peers:payload.connections.filter(c => c.showID === show.id)}))
    .filter(g => g.peers.length);
  const peers = groups.flatMap(g => g.peers);
  // Height answers to whichever column needs more room. Sizing on people alone
  // is what let the show column overflow silently.
  const height = Math.max(490, spanFor(groups.length, SHOW_INSET), spanFor(peers.length, PERSON_INSET));
  const rootY = height / 2;
  const nodes = [{kind:'root',data:payload.person,x:15,y:rootY}], edges = [];
  let offset = 0;
  groups.forEach((group, i) => {
    const showY = groups.length === 1 ? rootY : SHOW_TOP + i * (height - SHOW_INSET) / (groups.length - 1);
    nodes.push({kind:'show',data:group.show,x:48,y:showY});
    edges.push({x1:15,y1:rootY,x2:48,y2:showY,showID:group.show.id,exact:false});
    group.peers.forEach(c => {
      const y = peers.length === 1 ? rootY : PERSON_TOP + offset * (height - PERSON_INSET) / (peers.length - 1);
      offset++;
      nodes.push({kind:'person',data:c.person,x:83,y});
      edges.push({x1:48,y1:showY,x2:83,y2:y,showID:group.show.id,personID:c.person.id,exact:c.kind === 'shared_episode'});
    });
  });
  return {height,nodes,edges,shownShows:groups.map(g => g.show),hiddenShows:payload.shows.length - groups.length};
}
export function evidenceGroups(connection, sourcePerson) {
  const unique = rows => [...new Map(rows.filter(e => safeURL(e.audioURL)).map(e => [e.audioURL,e])).values()];
  if (connection.kind === 'shared_episode') {
    const targetURLs = new Set(connection.appearances.map(e => e.audioURL));
    // Intersection only: never accidentally call unrelated evidence a shared episode.
    return [{title:'Hear the connection', episodes:unique(connection.sourceAppearances.filter(e => targetURLs.has(e.audioURL)))}];
  }
  return [
    {title:`Featuring ${sourcePerson.name}`, episodes:unique(connection.sourceAppearances)},
    {title:`Featuring ${connection.person.name}`, episodes:unique(connection.appearances)},
  ];
}
