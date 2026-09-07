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
export function graphLayout(payload) {
  // People occupy one ordered column; show anchors stay spaced independently.
  // Each edge lives strictly between adjacent columns, away from other nodes.
  const groups = payload.shows.map(show => ({show, peers:payload.connections.filter(c => c.showID === show.id)}));
  const peers = groups.flatMap(g => g.peers);
  const height = Math.max(490, peers.length * 94 + 90);
  const rootY = height / 2;
  const nodes = [{kind:'root',data:payload.person,x:15,y:rootY}], edges = [];
  let offset = 0;
  groups.forEach((group, i) => {
    const showY = groups.length === 1 ? rootY : 112 + i * (height - 214) / (groups.length - 1);
    nodes.push({kind:'show',data:group.show,x:48,y:showY});
    edges.push({x1:15,y1:rootY,x2:48,y2:showY,showID:group.show.id,exact:false});
    group.peers.forEach(c => {
      const y = peers.length === 1 ? rootY : 80 + offset * (height - 185) / (peers.length - 1);
      offset++;
      nodes.push({kind:'person',data:c.person,x:83,y});
      edges.push({x1:48,y1:showY,x2:83,y2:y,showID:group.show.id,personID:c.person.id,exact:c.kind === 'shared_episode'});
    });
  });
  return {height,nodes,edges};
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
