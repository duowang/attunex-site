/* Public, static graph projections; browser-local follows; publisher-hosted audio.
   The shipped map is a SAMPLE of the graph (generate_explore_data.py --hops), so a
   connection can name someone whose own neighborhood is not published. Those carry
   `expandable: false`; every path that would recenter has to offer the app instead. */
import { graphLayout, evidenceGroups, searchPeople, safeURL } from './graph-model.js?v=1';
const $ = (id) => document.getElementById(id);
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'attunex-explore-follows-v1';
const APP_URL = 'https://apps.apple.com/us/app/attunex-podcast-player/id6786431074';
const EMBED = new URLSearchParams(location.search).has('embed');
document.body.classList.toggle('embedded', EMBED);
let followed = new Map();
try { const rows = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(rows)) followed = new Map(rows.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string').map(p => [p.id, p])); } catch { /* Storage can be unavailable. */ }
let people = [], byID = new Map(), starters = [], payload, selected = null, trail = [], request = 0, loading = false;
let resultLimit = 12, toastTimer, currentAudio = '', episodeRows = [];
const cache = new Map();
const audio = $('audio');
function announce(message) { $('announcement').textContent = message; }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3800); }
function persist() { try { localStorage.setItem(KEY, JSON.stringify([...followed.values()])); return true; } catch { return false; } }
function avatar(p, square = false, badge = false) {
  const name = p.name || p.title || '';
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => Array.from(w)[0] || '').join('');
  const src = safeURL(p.imageURL || p.artworkURL);
  return `<span class="avatar${square ? ' square' : ''}">${src ? `<img src="${escape(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-initials="${escape(initials)}">` : escape(initials)}${badge && followed.has(p.id) ? '<span class="follow-badge" aria-hidden="true">✓</span>' : ''}</span>`;
}
function followButton(p) {
  const isFollowed = followed.has(p.id);
  return `<button type="button" class="follow-button${isFollowed ? ' followed' : ''}" data-follow="${escape(p.id)}" aria-label="${isFollowed ? 'Unfollow' : 'Follow'} ${escape(p.name)}" aria-pressed="${isFollowed}">${isFollowed ? '✓ Following' : '+ Follow'}</button>`;
}
function sidebarRow(p) {
  const current = p.id === payload?.person.id;
  return `<li><button type="button" class="sidebar-person${current ? ' current' : ''}" data-open="${escape(p.id)}"${current ? ' aria-current="true"' : ''}>${avatar(p)}<span class="person-text"><strong>${escape(p.name)}</strong><small>${followed.has(p.id) ? '✓ Following' : current ? 'Exploring now' : 'Explore connections'}</small></span></button></li>`;
}
function list(title, rows) { return `<h2 class="list-heading">${title}</h2><ul class="person-list">${rows.map(sidebarRow).join('')}</ul>`; }
function renderSidebar() {
  const q = $('person-search').value.trim();
  if (q) {
    const results = searchPeople(people, q);
    $('people-list').innerHTML = `<p class="result-count" role="status">${results.length.toLocaleString()} ${results.length === 1 ? 'person' : 'people'} found</p><ul class="person-list">${results.slice(0, resultLimit).map(sidebarRow).join('')}</ul>${results.length > resultLimit ? '<button class="more-people" data-more>Show more</button>' : ''}${results.length ? '' : '<p class="list-empty">No matching people in this map yet. Try another name or interest, or <a href="/people">browse the directory</a>.</p>'}`;
    return;
  }
  const mine = [...followed.values()];
  const suggested = starters.filter(p => !followed.has(p.id)).slice(0, mine.length ? 5 : 8);
  $('people-list').innerHTML = (mine.length ? list('Your people', mine) : '<h2 class="list-heading">Your people</h2><p class="list-empty">Follow someone to keep a starting point here.</p>') + list(mine.length ? 'Keep exploring' : 'Start somewhere interesting', suggested);
}
function getPayload(id) {
  if (!cache.has(id)) {
    cache.set(id, fetch(`/explore/data/p/${encodeURIComponent(id)}.json`).then(r => { if (!r.ok) throw new Error('Unable to load graph'); return r.json(); }).then(p => { if (p.person?.id !== id || !Array.isArray(p.shows) || !Array.isArray(p.connections)) throw new Error('Invalid graph'); return p; }).catch(e => { cache.delete(id); throw e; }));
    // Bound long browsing sessions without preloading the whole graph.
    if (cache.size > 30) cache.delete(cache.keys().next().value);
  }
  return cache.get(id);
}
function setURL(id, replace = false) {
  const url = new URL(location.href); url.searchParams.set('p', byID.get(id)?.slug || id); url.searchParams.delete('c'); url.searchParams.delete('s');
  history[replace ? 'replaceState' : 'pushState']({personID:id}, '', url);
}
function resolveID(value) { return byID.has(value) ? value : people.find(p => p.slug === value)?.id || value; }
async function openPerson(id, {historyMode = 'push', resetTrail = false, focus = true} = {}) {
  id = resolveID(id);
  if (!id || !/^[\w-]+$/.test(id)) { renderError('This person couldn’t be found.', false); return; }
  if (people.length && !byID.has(id)) { renderBeyondSample(); return; }
  const requestedShow = new URLSearchParams(location.search).get('s');
  const version = ++request;
  if (resetTrail) trail = [];
  const previous = payload?.person;
  loading = true;
  $('world').setAttribute('aria-busy', 'true');
  $('graph-area').innerHTML = '<div class="graph-placeholder"><span class="loading-orbit" aria-hidden="true"></span><p>Finding connections…</p></div>';
  $('connection-panel').innerHTML = '<p class="quiet loading">Loading the episodes behind these connections…</p>';
  try {
    const data = await getPayload(id);
    if (version !== request) return;
    if (previous && previous.id !== id && !resetTrail) trail = [...trail.filter(p => p.id !== previous.id && p.id !== id), previous].slice(-4);
    payload = data;
    selected = data.connections.length ? {kind:'person', id:(data.connections.find(c => !followed.has(c.person.id)) || data.connections[0]).person.id} : data.shows.length ? {kind:'show', id:data.shows[0].id} : {kind:'root', id};
    if (historyMode !== 'none') setURL(id, historyMode === 'replace');
    document.title = `${data.person.name}’s podcast world — Attunex`;
    if (requestedShow && data.shows.some(s => s.id === requestedShow)) selected = {kind:'show', id:requestedShow};
    renderAll();
    announce(`Exploring ${data.person.name}. ${data.shows.length} podcasts and ${data.connections.length} connected people.`);
    if (focus) $('world').focus({preventScroll:true});
  } catch {
    if (version !== request) return;
    renderError('This part of the map couldn’t load.', true, id);
  } finally {
    if (version === request) { loading = false; $('world').removeAttribute('aria-busy'); }
  }
}
function renderBeyondSample() {
  $('world-heading').innerHTML = '';
  $('graph-area').innerHTML = `<div class="graph-placeholder"><h3>This person is beyond the web sample.</h3><p>attunex.app publishes part of the graph so you can try it in a browser. The iPhone app carries all of it.</p><a class="explore-button" href="${APP_URL}">Get Attunex for iPhone <span aria-hidden="true">↗</span></a><a href="/people">Browse people on the web</a></div>`;
  $('connection-panel').innerHTML = '<p class="quiet">Every path begins with a person.</p>';
  announce('This person is beyond the web sample. The iPhone app has the full graph.');
}
function renderError(message, retry, id = '') {
  $('world-heading').innerHTML = '';
  $('graph-area').innerHTML = `<div class="graph-placeholder"><h3>${escape(message)}</h3><p>Choose another person to keep exploring.</p>${retry ? `<button type="button" class="follow-button" data-open="${escape(id)}">Try again</button>` : ''}<a href="/people">Browse all people</a></div>`;
  $('connection-panel').innerHTML = '<p class="quiet">Every path begins with a person.</p>';
  announce(message);
}
function renderHeading() {
  const p = payload.person;
  $('world-heading').innerHTML = `<div class="world-heading"><div><p class="eyebrow">EXPLORING</p><h2>${escape(p.name)}’s world</h2><p class="bio">${escape(p.description || 'Podcast appearances and the people connected through them.')}</p></div><div class="heading-actions">${followButton(p)}<button type="button" class="icon-button" data-share aria-label="Copy a link to ${escape(p.name)}’s world" title="Copy link">↗</button></div></div>${trail.length ? `<nav class="graph-trail" aria-label="Your exploration path">${trail.map(p => `<button data-open="${escape(p.id)}">${escape(p.name)}</button><span aria-hidden="true">›</span>`).join('')}<span>${escape(p.name)}</span></nav>` : ''}`;
}
function renderGraph() {
  const p = payload.person;
  if (!payload.shows.length) {
    $('graph-area').innerHTML = `<div class="graph-placeholder">${avatar(p)}<h3>More of ${escape(p.name)}’s world is still being mapped.</h3><p>Keep this person in your following, or choose another starting point.</p>${followButton(p)}</div>`;
    return;
  }
  const layout = graphLayout(EMBED ? {...payload, connections:payload.connections.slice(0, 1)} : payload);
  const activeShow = selected?.kind === 'show' ? selected.id : payload.connections.find(c => c.person.id === selected?.id)?.showID;
  const nodes = layout.nodes.map(node => {
    const isRoot = node.kind === 'root', isShow = node.kind === 'show', obj = node.data;
    const isSelected = selected?.kind === node.kind && selected.id === obj.id;
    const meta = isShow ? `${obj.appearanceCount} ${obj.appearanceCount === 1 ? 'appearance' : 'appearances'}` : followed.has(obj.id) ? '✓ Following' : 'Not followed';
    return `<button type="button" class="graph-node ${node.kind}${isSelected ? ' selected' : ''}" style="left:${node.x}%;top:${node.y / layout.height * 100}%" data-select="${escape(obj.id)}" data-kind="${node.kind}" aria-pressed="${isSelected}" aria-label="${escape(obj.name || obj.title)}. ${escape(meta)}. ${isShow ? 'View podcast connections' : 'View person and episodes'}">${avatar(obj, isShow, !isShow)}<span class="node-title">${escape(obj.name || obj.title)}</span><span class="node-meta${!isShow && followed.has(obj.id) ? ' is-followed' : ''}">${meta}</span></button>`;
  }).join('');
  const paths = layout.edges.map(edge => `<path d="M ${edge.x1} ${edge.y1} C ${(edge.x1 + edge.x2) / 2} ${edge.y1}, ${(edge.x1 + edge.x2) / 2} ${edge.y2}, ${edge.x2} ${edge.y2}" class="${edge.exact ? 'exact' : ''} ${edge.showID === activeShow && (!edge.personID || edge.personID === selected?.id || selected?.kind === 'show') ? 'active' : ''}"/>`).join('');
  $('graph-area').innerHTML = `<div class="graph" style="height:${layout.height}px"><div class="graph-columns" aria-hidden="true"><span style="left:15%">A starting point</span><span style="left:48%">Through podcasts</span><span style="left:83%">Discover people</span></div><svg class="graph-lines" viewBox="0 0 100 ${layout.height}" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>${nodes}</div>`;
}
function fmtDate(date) { if (!date) return ''; const d = new Date(date); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', {month:'short',year:'numeric',timeZone:'UTC'}); }
function episodeGroup(title, episodes) {
  if (!episodes.length) return '';
  return `<section class="episode-section"><h3>${escape(title)}</h3>${episodes.map(e => {
    const idx = episodeRows.push(e) - 1;
    const meta = [fmtDate(e.publishedAt), e.duration ? `${Math.round(e.duration / 60)} min` : '', e.languageCode?.toUpperCase()].filter(Boolean).join(' · ');
    return `<button type="button" class="episode-row${currentAudio === e.audioURL ? ' playing' : ''}" data-play="${idx}" aria-label="Play ${escape(e.episodeTitle)}"><span class="play-disc" aria-hidden="true">▶</span><span class="episode-copy"><strong>${escape(e.episodeTitle)}</strong><small>${escape(meta)}</small></span></button>`;
  }).join('')}</section>`;
}
function profileLink(person) {
  const slug = byID.get(person.id)?.slug;
  return slug ? `<a class="profile-link" href="/p/${encodeURIComponent(slug)}">See all appearances <span aria-hidden="true">↗</span></a>` : '';
}
function personIdentity(person, action = 'none') {
  const first = escape(person.name.split(' ')[0]);
  // 'app' is not a failure: this person is real and their connection is real, the web
  // sample just stops here. Say that plainly rather than hiding the person or the edge.
  const cta = action === 'explore'
    ? `<button class="explore-button" type="button" data-open="${escape(person.id)}">Explore ${first}’s world <span aria-hidden="true">→</span></button>`
    : action === 'app'
      ? `<a class="explore-button" href="${APP_URL}">Open ${first}’s world in the app <span aria-hidden="true">↗</span></a><p class="sample-note">This map is a sample of the Attunex graph. ${first}’s own connections are in the iPhone app.</p>`
      : '';
  return `<div class="detail-person">${avatar(person, false, true)}<div><h2>${escape(person.name)}</h2>${followButton(person)}</div></div><p class="detail-bio">${escape(person.description || '')}</p>${cta}`;
}
function renderDetail() {
  episodeRows = [];
  const p = payload.person;
  const c = selected?.kind === 'person' ? payload.connections.find(c => c.person.id === selected.id) : null;
  const show = payload.shows.find(s => s.id === (c?.showID || selected?.id));
  const panel = $('connection-panel');
  if (c && show) {
    const groups = evidenceGroups(c, p);
    panel.innerHTML = `<div class="detail-identity"><p class="eyebrow">${followed.has(c.person.id) ? 'IN YOUR FOLLOWING' : 'BEYOND YOUR FOLLOWING'}</p>${personIdentity(c.person, c.expandable === false ? 'app' : 'explore')}<div class="connection-story"><p class="relationship">${c.kind === 'shared_episode' ? 'In the same episode' : 'Through a shared podcast'}</p><p><strong>${escape(p.name)}</strong> ${c.kind === 'shared_episode' ? 'and' : '→'} <strong>${escape(c.person.name)}</strong>${c.kind === 'shared_episode' ? ' are featured in the same episode of ' : ' both appear on '}<strong>${escape(show.title)}</strong>.</p></div>${profileLink(c.person)}</div><div class="detail-evidence">${groups.map(g => episodeGroup(g.title, g.episodes)).join('')}<p class="quiet" style="font-size:12px">${c.kind === 'shared_episode' ? 'Shared episodes may include compilations or clips.' : 'A shared show doesn’t necessarily mean a shared conversation.'}</p></div>`;
  } else if (selected?.kind === 'show' && show) {
    const connections = payload.connections.filter(c => c.showID === show.id);
    const source = [...new Map(connections.flatMap(c => c.sourceAppearances).map(e => [e.audioURL, e])).values()];
    panel.innerHTML = `<div class="detail-identity"><p class="eyebrow">A PODCAST CONNECTION</p><div class="detail-person">${avatar(show, true)}<h2>${escape(show.title)}</h2></div><p class="detail-bio">${escape(p.name)} has ${show.appearanceCount} identified ${show.appearanceCount === 1 ? 'appearance' : 'appearances'} here.</p>${connections.length ? '<h3 class="list-heading">People to explore</h3>' : ''}<div class="show-peers">${connections.map(c => `<button data-select="${escape(c.person.id)}" data-kind="person">${escape(c.person.name)} ${followed.has(c.person.id) ? '✓' : '→'}</button>`).join('')}</div>${safeURL(show.feedURL) ? `<a class="profile-link" href="${escape(safeURL(show.feedURL))}" target="_blank" rel="noopener">Open podcast RSS <span aria-hidden="true">↗</span></a>` : ''}</div><div class="detail-evidence">${episodeGroup(`Featuring ${p.name}`, source)}${source.length ? '' : '<p class="quiet">This map has no shared episode evidence to play for this show yet.</p>'}${profileLink(p)}</div>`;
  } else {
    panel.innerHTML = `<div class="detail-identity"><p class="eyebrow">YOUR STARTING POINT</p>${personIdentity(p)}${profileLink(p)}</div><div class="detail-evidence"><div class="connection-story"><p>Choose a podcast or a connected person on the map to explore their episodes.</p></div></div>`;
  }
}
function renderAll() { renderSidebar(); renderHeading(); renderGraph(); renderDetail(); }
function toggleFollow(id) {
  const p = byID.get(id) || (payload?.person.id === id ? payload.person : payload?.connections.find(c => c.person.id === id)?.person) || followed.get(id);
  if (!p) return;
  const adding = !followed.has(id);
  if (adding) followed.set(id, {id:p.id,name:p.name,description:p.description || '',imageURL:p.imageURL || ''}); else followed.delete(id);
  const saved = persist();
  renderSidebar();
  if (payload && !loading) { renderHeading(); renderGraph(); renderDetail(); }
  toast(`${adding ? `Following ${p.name}` : `Unfollowed ${p.name}`}${saved ? '' : ' for this visit. Browser storage is unavailable.'}`);
}
async function playEpisode(index) {
  const e = episodeRows[index];
  const src = safeURL(e?.audioURL);
  if (!src) { toast('This episode’s audio is unavailable. Try another episode.'); return; }
  $('player').hidden = false; document.body.classList.add('has-player'); $('audio-error').hidden = true;
  $('playing-title').textContent = e.episodeTitle; $('playing-show').textContent = e.showTitle;
  if (currentAudio !== e.audioURL) { currentAudio = e.audioURL; audio.src = src; }
  try { await audio.play(); } catch { $('audio-error').textContent = 'Playback couldn’t start. Try the play control, or choose another episode.'; $('audio-error').hidden = false; }
  if (payload && !loading) renderDetail();
}
document.addEventListener('error', event => {
  const img = event.target;
  if (img instanceof HTMLImageElement && img.dataset.initials !== undefined) img.replaceWith(document.createTextNode(img.dataset.initials));
}, true);
document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.open) { const id = button.dataset.open; await openPerson(id, {resetTrail:button.classList.contains('sidebar-person')}); if (!EMBED && matchMedia('(max-width:1000px)').matches) $('world').scrollIntoView({behavior:'smooth',block:'start'}); }
  else if (button.dataset.select && payload && !loading) {
    if (EMBED) {
      const url = new URL('/explore', location.origin);
      url.searchParams.set('p', button.dataset.kind === 'person' ? button.dataset.select : payload.person.id);
      if (button.dataset.kind === 'show') url.searchParams.set('s', button.dataset.select);
      window.top.location.href = url.href;
      return;
    }
    selected = {kind:button.dataset.kind, id:button.dataset.select};
    renderGraph(); renderDetail();
    const replacement = document.querySelector(`.graph-node[data-select="${CSS.escape(selected.id)}"]`); replacement?.focus({preventScroll:true});
    announce(`Selected ${button.getAttribute('aria-label') || button.textContent.trim()}. Connection details below the map on small screens.`);
    // On phones a node tap opens its evidence immediately, with the map still above it.
    if (matchMedia('(max-width:1000px)').matches) { $('connection-panel').scrollIntoView({behavior:'smooth',block:'start'}); $('connection-panel').focus({preventScroll:true}); }
  } else if (button.dataset.follow) {
    const id = button.dataset.follow; const inDetail = button.closest('#connection-panel');
    toggleFollow(id);
    const scope = inDetail ? $('connection-panel') : $('world-heading');
    scope.querySelector(`[data-follow="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
  } else if (button.dataset.play !== undefined) await playEpisode(Number(button.dataset.play));
  else if (button.hasAttribute('data-more')) { resultLimit += 24; renderSidebar(); }
  else if (button.hasAttribute('data-share')) {
    try { await navigator.clipboard.writeText(location.href); toast('Link copied. Share this starting point.'); }
    catch { toast('Copy the address from your browser to share this world.'); }
  }
});
$('person-search').addEventListener('input', () => { resultLimit = 12; renderSidebar(); });
document.querySelector('.explore-search').addEventListener('submit', event => { event.preventDefault(); const first = searchPeople(people, $('person-search').value)[0]; if (first) openPerson(first.id, {resetTrail:true}); });
$('close-player').addEventListener('click', () => { audio.pause(); audio.removeAttribute('src'); audio.load(); currentAudio = ''; $('player').hidden = true; document.body.classList.remove('has-player'); if (payload && !loading) renderDetail(); });
audio.addEventListener('error', () => { if (!currentAudio) return; $('audio-error').textContent = 'The podcast publisher’s audio couldn’t load. Try another episode.'; $('audio-error').hidden = false; });
window.addEventListener('popstate', () => { const p = new URLSearchParams(location.search).get('p') || starters[0]?.id; if (p) openPerson(p, {historyMode:'none',resetTrail:true}); });
window.addEventListener('storage', event => { if (event.key !== KEY) return; try { const saved = JSON.parse(event.newValue || '[]'); if (Array.isArray(saved)) followed = new Map(saved.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string').map(p => [p.id,p])); renderSidebar(); if (payload && !loading) renderAll(); } catch { /* Ignore malformed storage. */ } });
async function boot() {
  try {
    const response = await fetch('/explore/data/index.json'); if (!response.ok) throw new Error('Index unavailable');
    const data = await response.json();
    people = data.people; byID = new Map(people.map(p => [p.id,p]));
    starters = people.filter(p => p.slug && p.connectionCount > 0); if (!starters.length) starters = people;
    renderSidebar();
    const first = new URLSearchParams(location.search).get('p') || [...followed.keys()].find(id => byID.has(id)) || starters[0]?.id;
    if (!first) { renderError('The map is being prepared. Come back soon.',false); return; }
    const date = fmtDate(data.generatedAt);
    const coverage = data.coverage || {};
    const count = value => Number(value).toLocaleString();
    const updated = date ? ` · Updated ${escape(date)}` : '';
    $('coverage-note').innerHTML = coverage.shippedPeople && coverage.graphPeople
      ? `This map is a sample of the Attunex graph — <strong>${count(coverage.shippedPeople)}</strong> of <strong>${count(coverage.graphPeople)}</strong> people, drawn from identified podcast appearances${updated}. <a href="${APP_URL}">The iPhone app explores all of them <span aria-hidden="true">↗</span></a>`
      : `Connections are drawn from identified podcast appearances${updated}. The map grows as more episodes are indexed.`;
    await openPerson(first, {historyMode:'replace',focus:false});
  } catch {
    $('people-list').innerHTML = '<p class="quiet">Starting points couldn’t load. <button class="more-people" data-reload>Try again</button> or <a href="/people">browse people</a>.</p>';
    $('people-list').querySelector('[data-reload]').addEventListener('click', boot);
    renderError('The map couldn’t load right now.', false);
  }
}
boot();
