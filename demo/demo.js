/* Attunex web preview: a small clone of the iPhone app's core flow, running on
   the static graph data under /demo/data. No server, no vendor. Follows and
   playback positions live in this browser (localStorage). */
(() => {
"use strict";

// ---------------------------------------------------------------- constants
const Q = new URLSearchParams(location.search);
const EMBED = Q.has("embed");
const KEY = "attunex-demo-v1";
const FREE_LIMIT = 5;                       // GuestCastModel.freeActivePersonLimit
const SPEEDS = [0.8, 1, 1.3, 1.5, 1.8, 2];  // EpisodePlaybackController presets
const SKIPS = [15, 30, 45, 60, 90];
const APP_STORE = "https://apps.apple.com/us/app/attunex-podcast-player/id6786431074";
const DEFAULT_PEOPLE = ["jensen-huang", "steven-pinker", "demis-hassabis"];
const DEFAULT_SHOWS = ["7eeae9d1-141e-5133-9e8f-6c1da695e40c"]; // Lex Fridman Podcast
const PAGE = 25;
// A real summary the app wrote on an iPhone (the App Store "Read" screenshot).
const SAMPLE = {
  id: "sample-the-town", sample: true,
  t: "The Surprising Winners of the AI-Enabled Entertainment Economy",
  show: { id: "", t: "The Town with Matthew Belloni", art: "" },
  d: "2026-07-24", dur: 37 * 60, a: "", n: "", readMin: 28,
  summary: [
    "The podcast episode discusses the potential winners of the AI-enabled entertainment economy, focusing on the MS Media Matrix developed by Morgan Stanley analyst Sean Diffley. The matrix ranks publicly traded entertainment companies based on factors like audience size, engagement, interactivity, urgency, pricing power, intellectual property ownership, and AI positioning.",
    "Sports and live events are highlighted as the best-positioned sectors due to their ability to capture viewer attention through urgency, unpredictability, and community participation. The episode also explores the strategic importance of sports in the media landscape and the potential of companies like Formula One to thrive in this new era.",
  ],
};

// ---------------------------------------------------------------- state
function defaults() {
  return { people: DEFAULT_PEOPLE.slice(), shows: DEFAULT_SHOWS.slice(), speed: 1, skipBack: 30, skipFwd: 30,
    progress: {}, theme: "ember", textScale: 1, sort: "newest", feedFilter: "all", readFilter: "all", recent: [] };
}
let state = defaults();
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { /* fresh */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ } }
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.setProperty("--ts", state.textScale);
}

// ---------------------------------------------------------------- data
const cache = new Map();
function getJSON(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.json(); })
      .catch((e) => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
}
let DIR = [], DIR_BY_SLUG = new Map(), SHOWS = [], SHOWS_BY_ID = new Map();
const loadPerson = (slug) => getJSON(`/demo/data/p/${encodeURIComponent(slug)}.json`).then((p) => { p.slug = slug; return p; });
const loadShow = (id) => getJSON(`/demo/data/s/${encodeURIComponent(id)}.json`);

const ROWS = new Map(); // episode id -> row model, for clicks on rendered rows
function mkRow(ep, show, x = {}) {
  const r = { id: ep.id, t: ep.t, d: ep.d || "", dur: ep.dur || 0, a: ep.a || "", n: ep.n || "", show,
    person: x.person || null, people: x.people || [], grade: ep.g || "f", ai: !!ep.ai, fromShow: !!x.fromShow };
  ROWS.set(r.id, r);
  return r;
}
let FEED = [];
async function refreshFeed() {
  const [people, shows] = await Promise.all([
    Promise.all(state.people.map((s) => loadPerson(s).catch(() => null))),
    Promise.all(state.shows.map((id) => loadShow(id).catch(() => null))),
  ]);
  const rows = new Map();
  people.forEach((p) => p && p.episodes.forEach((ep) => {
    if (ep.g !== "f" || ep.ai || rows.has(ep.id)) return;
    rows.set(ep.id, mkRow(ep, p.showList[ep.s], { person: { slug: p.slug, name: p.name } }));
  }));
  shows.forEach((s) => s && s.episodes.forEach((ep) => {
    if (rows.has(ep.id)) return;
    rows.set(ep.id, mkRow(ep, { id: s.id, t: s.t, art: s.art }, { fromShow: true, people: ep.p }));
  }));
  FEED = [...rows.values()];
  return FEED;
}
function feedView() {
  let list = FEED;
  if (state.feedFilter === "guest") list = list.filter((r) => r.person);
  if (state.feedFilter === "podcast") list = list.filter((r) => !r.person);
  return list.slice().sort((a, b) => (state.sort === "oldest" ? a.d.localeCompare(b.d) : b.d.localeCompare(a.d)));
}
const isFollowed = (slug) => state.people.includes(slug);
const isFollowedShow = (id) => state.shows.includes(id);

// ---------------------------------------------------------------- helpers
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function fmtClock(s) {
  s = Math.max(0, Math.round(s || 0));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}
function fmtDur(s) {
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60);
  return hh ? `${hh}h ${mm}m` : `${mm}m`;
}
const readMin = (r) => (r.readMin || Math.max(1, Math.round((r.dur / 60) * 0.78)));
const norm = (s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const HUES = ["#8C6A4E", "#6E7C5A", "#5C6F86", "#8A5B6B", "#7B6E4F", "#4F7B78"];
function hue(name) { let n = 0; for (const c of name) n = (n * 31 + c.charCodeAt(0)) >>> 0; return HUES[n % HUES.length]; }
function initials(name) { return name.split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase(); }
function img(src, cls, name, size) {
  if (!src) return `<div class="${cls} mono" style="background:${hue(name)}">${h(initials(name))}</div>`;
  return `<img class="${cls}" src="${h(src)}" alt="" loading="lazy" width="${size}" height="${size}" data-name="${h(name)}">`;
}
const personImage = (slug, p) => (DIR_BY_SLUG.get(slug) || {}).image || (p && p.image) || "";
const personName = (slug) => (DIR_BY_SLUG.get(slug) || {}).name || slug;

// ---------------------------------------------------------------- icons
const svg = (inner, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const fill = (inner) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${inner}</svg>`;
const I = {
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  headphones: svg('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>'),
  book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5M20 18v3H6.5"/>'),
  chevL: svg('<path d="m15 5-7 7 7 7"/>'), chevR: svg('<path d="m9 5 7 7-7 7"/>'), chevD: svg('<path d="m5 9 7 7 7-7"/>'),
  play: fill('<path d="M7 4.5v15l13-7.5z"/>'),
  pause: fill('<rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/>'),
  playCircle: fill('<circle cx="12" cy="12" r="11"/><path fill="var(--page)" d="M9.6 7.4v9.2l7.6-4.6z"/>'),
  pauseCircle: fill('<circle cx="12" cy="12" r="11"/><rect fill="var(--page)" x="8.2" y="7.5" width="2.6" height="9" rx=".6"/><rect fill="var(--page)" x="13.2" y="7.5" width="2.6" height="9" rx=".6"/>'),
  next: fill('<path d="M5 5v14l10-7z"/><rect x="16.5" y="5" width="2.5" height="14" rx=".8"/>'),
  plusCircle: fill('<circle cx="12" cy="12" r="10"/><path fill="var(--tint)" d="M11 7h2v4h4v2h-4v4h-2v-4H7v-2h4z"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7"/>', 2.5),
  checkCircle: fill('<circle cx="12" cy="12" r="10"/><path stroke="var(--page)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none" d="m7.5 12.5 3 3 6-6"/>'),
  xCircle: fill('<circle cx="12" cy="12" r="10"/><path stroke="var(--page)" stroke-width="2" stroke-linecap="round" d="m9 9 6 6m0-6-6 6"/>'),
  person: fill('<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0z"/>'),
  wave: svg('<path d="M4 11v2M8 8v8M12 5v14M16 8v8M20 11v2"/>'),
  sparkles: fill('<path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>'),
  download: svg('<circle cx="12" cy="12" r="10"/><path d="M12 7v9m-3.5-3.5L12 16l3.5-3.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  doc: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 1.6),
  palette: svg('<path d="M12 3a9 9 0 0 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/>', 1.6),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', 1.6),
  cloud: svg('<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4 4 0 0 1 0 9z"/>', 1.6),
  star: fill('<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/>'),
  people: fill('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 19a6.5 6.5 0 0 1 13 0z"/><circle cx="17" cy="9" r="2.6"/><path d="M15.2 13.2A5 5 0 0 1 21.5 18h-4a8 8 0 0 0-2.3-4.8z"/>'),
  aa: fill('<text x="2" y="17.5" font-size="13" font-weight="700" font-family="-apple-system,system-ui,sans-serif">AA</text>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
};
const skipIcon = (n, back) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
  back ? '<polyline points="2.5 4.5 2.5 10 8 10"/><path d="M4.4 15a8.5 8.5 0 1 0 1.9-8.7L2.5 10"/>'
       : '<polyline points="21.5 4.5 21.5 10 16 10"/><path d="M19.6 15a8.5 8.5 0 1 1-1.9-8.7L21.5 10"/>'
}<text x="12" y="15.6" text-anchor="middle" font-size="7.6" font-weight="700" fill="currentColor" stroke="none" font-family="-apple-system,system-ui,sans-serif">${n}</text></svg>`;

// ---------------------------------------------------------------- shell
const app = document.getElementById("app");
const audio = document.getElementById("audio");
let screensEl, miniEl, tabsEl;
const stack = []; // pushed screens above the current tab root
let tab = "listen";
const roots = {};

function layout() {
  const wide = window.matchMedia("(min-width: 600px)").matches;
  document.body.classList.toggle("embed", EMBED);
  document.body.classList.toggle("wide", !EMBED && wide);
  document.body.classList.toggle("mobile", !EMBED && !wide);
  if (EMBED) {
    // The host page sizes the iframe (any width, 393:852); the device scales to fill it exactly.
    document.body.style.setProperty("--fit", (window.innerWidth / 393).toFixed(4));
  } else if (wide) {
    const fit = Math.min(1, (window.innerHeight - 56) / 852, (window.innerWidth - 56) / 393);
    document.body.style.setProperty("--fit", fit.toFixed(3));
  }
}

function header({ title, titleAction, left, right }) {
  const l = left === "back" ? `<button class="round plain" data-action="back" aria-label="Back">${I.chevL}</button>`
          : left === "menu" ? `<button class="round" data-action="settings" aria-label="Settings">${I.menu}</button>` : `<span class="round plain"></span>`;
  const r = right === "search" ? `<button class="round" data-action="search" aria-label="Search">${I.search}</button>`
          : right === "close" ? `<button class="round plain" data-action="close" aria-label="Close">${I.chevD}</button>` : (right || `<span class="round plain"></span>`);
  const t = titleAction ? `<button class="title btn" data-action="${titleAction}">${h(title)}${I.chevD}</button>` : `<div class="title">${h(title)}</div>`;
  return `<div class="hdr">${l}${t}${r}</div>`;
}

function setTab(name, force) {
  if (tab === name && !force && !stack.length) { roots[name].querySelector(".content").scrollTo({ top: 0, behavior: "smooth" }); return; }
  while (stack.length) stack.pop().el.remove();
  tab = name;
  for (const k of Object.keys(roots)) roots[k].hidden = k !== name;
  renderRoot(name);
  tabsEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
}
function renderRoot(name) {
  const el = roots[name];
  if (name === "listen") renderListen(el); else renderRead(el);
}
function push(kind, render) {
  const top = stack.length ? stack[stack.length - 1].el : roots[tab];
  top.hidden = true;
  const el = document.createElement("div");
  el.className = "screen";
  el.dataset.kind = kind;
  screensEl.append(el);
  stack.push({ el, kind });
  render(el);
  return el;
}
function pop() {
  if (!stack.length) return;
  stack.pop().el.remove();
  (stack.length ? stack[stack.length - 1].el : roots[tab]).hidden = false;
}
const sheets = [];
function openSheet(cls, render) {
  const el = document.createElement("div");
  el.className = `sheet ${cls}`;
  app.append(el);
  sheets.push(el);
  render(el);
  return el;
}
function closeSheet(el) {
  const i = sheets.indexOf(el);
  if (i >= 0) sheets.splice(i, 1);
  el.remove();
}
function closeTopSheet() { if (sheets.length) closeSheet(sheets[sheets.length - 1]); }
let toastTimer;
function toast(msg) {
  let t = app.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); app.append(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}
function openMenu(anchor, html, onClick) {
  closeMenu();
  const scrim = document.createElement("div"); scrim.className = "scrim"; scrim.dataset.menu = "1";
  const menu = document.createElement("div"); menu.className = "menu"; menu.innerHTML = html;
  const devEl = document.getElementById("device");
  const dev = devEl.getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  const scale = dev.width / devEl.offsetWidth;
  const top = (a.bottom - dev.top) / scale + 6;
  let left = (a.left - dev.left) / scale;
  menu.style.top = `${Math.min(top, devEl.offsetHeight - 280)}px`;
  app.append(scrim, menu);
  left = Math.max(8, Math.min(left, devEl.offsetWidth - menu.offsetWidth - 8));
  menu.style.left = `${left}px`;
  scrim.addEventListener("click", closeMenu);
  menu.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; onClick(b); closeMenu(); });
}
function closeMenu() { app.querySelectorAll(".scrim[data-menu], .menu").forEach((n) => n.remove()); }

// ---------------------------------------------------------------- rows
function pillHTML(r) {
  if (!r.a) return `<span class="pill nofile">${I.play}<span>${r.dur ? fmtClock(r.dur) : "--:--"}</span></span>`;
  const cur = player.row && player.row.id === r.id;
  const pos = cur ? audio.currentTime : (state.progress[r.id] || 0);
  const dur = (cur && audio.duration) || r.dur || 0;
  const p = dur ? Math.min(1, pos / dur) : 0;
  const label = (cur || pos > 5) && dur ? `-${fmtClock(dur - pos)}` : (dur ? fmtClock(dur) : "--:--");
  const playing = cur && !audio.paused;
  return `<button class="pill" data-action="play" data-ep="${h(r.id)}" style="--p:${p.toFixed(3)}" aria-label="${playing ? "Pause" : "Play"}"><i></i>${playing ? I.pause : I.play}<span>${label}</span></button>`;
}
function rowHTML(r, o = {}) {
  const cur = player.row && player.row.id === r.id;
  const chips = [];
  if (r.person && !o.noPerson) chips.push(`<button class="chip person" data-action="person" data-slug="${h(r.person.slug)}">${I.person}${h(r.person.name)}</button>`);
  else if (o.showPeople && r.people && r.people.length) r.people.forEach((s) => chips.push(`<button class="chip person" data-action="person" data-slug="${h(s)}">${I.person}${h(personName(s))}</button>`));
  if (o.relevance) chips.push(`<span class="chip ${r.grade === "f" ? "tint" : ""}">${r.grade === "f" ? "Guest appearance" : "Discussed"}</span>`);
  if (r.ai) chips.push(`<span class="chip ai">AI show</span>`);
  const showLine = o.hideShow ? "" : `<div class="show">${r.fromShow ? I.wave : ""}<span>${h(r.show.t)}</span></div>`;
  return `<li class="row${cur ? " current" : ""}${o.compact ? " compact" : ""}" data-ep="${h(r.id)}">
    <button class="rowtap" data-action="episode" data-ep="${h(r.id)}" aria-label="${h(r.t)}"></button>
    ${img(r.show.art, "art", r.show.t, o.compact ? 52 : 72)}
    <div class="main">
      <div class="t${r.grade === "m" ? " dim" : ""}">${h(r.t)}</div>
      ${showLine}
      ${chips.length ? `<div class="badges">${chips.join("")}</div>` : ""}
      <div class="meta"><span>${h(fmtDate(r.d))}</span>${state.progress[r.id] ? `<span class="dl">${I.download}</span>` : ""}${pillHTML(r)}</div>
    </div></li>`;
}
function refreshPills() {
  app.querySelectorAll(".row[data-ep]").forEach((li) => {
    const r = ROWS.get(li.dataset.ep);
    if (!r) return;
    li.classList.toggle("current", !!(player.row && player.row.id === r.id));
    const pill = li.querySelector(".pill");
    if (pill) pill.outerHTML = pillHTML(r);
  });
}

// ---------------------------------------------------------------- Listen
async function renderListen(el) {
  const total = state.people.length + state.shows.length;
  el.innerHTML = header({ title: "Following", titleAction: "following", left: "menu", right: "search" }) +
    `<div class="content"><div class="note">Finding episodes from the people you follow…</div></div>`;
  if (!total) {
    el.querySelector(".content").innerHTML = `<div class="empty"><strong>Nothing followed yet</strong>Follow people or podcasts and their episodes show up here.<div><button class="cta" data-action="search">Find something to follow</button></div></div>`;
    return;
  }
  await refreshFeed();
  if (el.hidden && tab !== "listen") return;
  const list = feedView();
  const n = list.length;
  const kind = state.feedFilter === "guest" ? "guest " : state.feedFilter === "podcast" ? "podcast " : "";
  const count = `${n} ${kind}episode${n === 1 ? "" : "s"}`;
  const nonDefault = state.sort !== "newest" || state.feedFilter !== "all";
  const empty = state.feedFilter === "guest" ? `<div class="empty">No Guest episodes yet.<div><button class="cta bordered" data-action="search">Find people</button></div></div>`
              : state.feedFilter === "podcast" ? `<div class="empty">No Podcast episodes yet.<div><button class="cta bordered" data-action="search">Find podcasts</button></div></div>`
              : `<div class="empty">No matches yet.</div>`;
  el.querySelector(".content").innerHTML = `
    <div class="listhead"><span class="count muted">${count}</span>
      <button class="pill-btn${nonDefault ? " on" : ""}" data-action="feed-menu">${state.sort === "oldest" ? "Oldest first" : "Newest first"}${I.chevD}</button></div>
    ${n ? `<ul class="group" data-list="feed">${list.slice(0, PAGE).map((r) => rowHTML(r)).join("")}</ul>` : empty}
    ${n > PAGE ? `<button class="loadmore" data-action="more" data-list="feed">Show more</button>` : ""}`;
  LISTS.feed = list;
}
const LISTS = {}; // list id -> row array (for queues and "Show more")
function appendMore(btn) {
  const list = LISTS[btn.dataset.list] || [];
  const ul = btn.previousElementSibling;
  const have = ul.children.length;
  const opts = JSON.parse(ul.dataset.opts || "{}");
  ul.insertAdjacentHTML("beforeend", list.slice(have, have + PAGE).map((r) => rowHTML(r, opts)).join(""));
  if (ul.children.length >= list.length) btn.remove();
}
function feedMenu(anchor) {
  const ck = (on) => (on ? I.check : "");
  openMenu(anchor, `<h5>Show</h5>
    <button data-v="filter:all">All episodes ${ck(state.feedFilter === "all")}</button>
    <button data-v="filter:guest">By Guest only ${ck(state.feedFilter === "guest")}</button>
    <button data-v="filter:podcast">By Podcast only ${ck(state.feedFilter === "podcast")}</button>
    <h5>Sort</h5>
    <button data-v="sort:newest">Newest first ${ck(state.sort === "newest")}</button>
    <button data-v="sort:oldest">Oldest first ${ck(state.sort === "oldest")}</button>`, (b) => {
    const [k, v] = b.dataset.v.split(":");
    if (k === "filter") state.feedFilter = v; else state.sort = v;
    save(); renderListen(roots.listen);
  });
}

// ---------------------------------------------------------------- Read
function readItems() {
  const items = [SAMPLE];
  feedView().slice(0, 30).forEach((r) => items.push(r));
  return state.readFilter === "ready" ? items.filter((r) => r.sample) : items;
}
async function renderRead(el) {
  el.innerHTML = header({ title: "Read", left: "menu", right: "search" }) + `<div class="content"><div class="note">Loading your reading queue…</div></div>`;
  if (!FEED.length && (state.people.length || state.shows.length)) await refreshFeed();
  const items = readItems();
  el.querySelector(".content").innerHTML = `
    <div class="listhead"><span class="count">${items.length} to read</span>
      <button class="pill-btn${state.readFilter === "ready" ? " on" : ""}" data-action="read-menu">${state.readFilter === "ready" ? "Transcript ready" : "All content"}${I.chevD}</button></div>
    <div class="note" style="padding-top:0">Transcripts and summaries are made on your iPhone. This preview shows one real summary and the publisher's notes.</div>
    ${items.map(readCard).join("")}`;
}
function readCard(r) {
  const ready = !!r.sample;
  const tag = ready ? `<span class="tag ready">${I.check}Ready</span>` : r.n ? `<span class="tag">${I.doc}Notes only</span>` : `<span class="tag">${I.download}Download to read</span>`;
  const foot = ready ? `<span>${fmtDur(r.dur)}</span><span>→</span><span>~${readMin(r)} min read</span>`
                     : `<span>${fmtDur(r.dur)}</span><span>→</span><span>~${readMin(r)} min read</span><span class="r">${r.n ? "~1 min of notes" : ""}</span>`;
  const ex = ready ? r.summary[0] : (r.n || "No notes from the publisher yet.");
  return `<button class="rcard" data-action="read" data-ep="${h(r.id)}">
    <div class="eyebrow"><span>${h(r.show.t)}</span><span class="d">${h(fmtDate(r.d))}</span>${tag}</div>
    <h3 class="${ready || r.n ? "" : "dim"}">${h(r.t)}</h3>
    <div class="ex">${h(ex)}</div>
    <div class="foot">${foot}</div></button>`;
}
function readMenu(anchor) {
  openMenu(anchor, `<button data-v="all">All content ${state.readFilter === "all" ? I.check : ""}</button><button data-v="ready">Transcript ready ${state.readFilter === "ready" ? I.check : ""}</button>`,
    (b) => { state.readFilter = b.dataset.v; save(); renderRead(roots.read); });
}
function openReader(r) {
  let mode = r.sample ? "summary" : "notes";
  const el = openSheet("reader", () => {});
  const draw = () => {
    const chip = (m, label, gen) => `<button data-mode="${m}" aria-pressed="${mode === m}">${gen ? I.sparkles : ""}${label}</button>`;
    let prov = "", body = "";
    if (mode === "notes") {
      prov = `<span>The publisher's notes</span><span>${r.n ? "Shortened in this preview" : ""}</span>`;
      body = r.n ? `<div class="text"><p>${h(r.n)}</p></div><div class="state">Full show notes open in the app.</div>` : `<div class="state"><b>No notes yet</b>The publisher did not include show notes for this episode.</div>`;
    } else if (mode === "transcript") {
      prov = `<span>Verbatim, with timestamps</span><span>Transcribed on device</span>`;
      body = `<div class="state">${I.sparkles}<b>No transcript yet</b>Attunex transcribes episodes on your iPhone, privately. The web preview can't run that model, so this stays empty here.</div>`;
    } else if (mode === "summary") {
      prov = `<span>One paragraph per section</span><span>~${readMin(r)} min read</span>`;
      body = r.sample ? `<div class="text">${r.summary.map((p) => `<p>${h(p)}</p>`).join("")}</div><div class="state">Written on an iPhone by Attunex. Sections beyond these open in the app.</div>`
                      : `<div class="state">${I.sparkles}<b>Not summarized yet</b>On your iPhone this reads “Summarizing on device — 1 of 5.” The summary is generated privately, without sending audio anywhere.</div>`;
    } else {
      prov = `<span>The shortest summary</span><span></span>`;
      body = `<div class="state">${I.sparkles}<b>Brief</b>A few sentences distilled from the summary, made on your iPhone.</div>`;
    }
    el.innerHTML = header({ title: r.show.t, left: "back", right: `<button class="round" data-action="text-size" aria-label="Text size">${I.aa}</button>` }) +
      `<div class="content body">
        <h1>${h(r.t)}</h1>
        <div class="meta">${h(r.show.t)} · ${h(fmtDate(r.d))} · ${fmtDur(r.dur)} listen</div>
        <div class="chips">${chip("notes", "Notes")}${chip("transcript", "Transcript", !r.sample)}${chip("summary", "Summary", !r.sample)}${chip("brief", "Brief", true)}</div>
        <div class="prov">${prov}</div>${body}</div>`;
    el.querySelector(".chips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { mode = b.dataset.mode; draw(); } });
    el.querySelector('[data-action="back"]').dataset.action = "close";
  };
  draw();
  el.draw = draw;
}

// ---------------------------------------------------------------- Person
async function openPerson(slug) {
  const el = push("person", (el) => { el.innerHTML = header({ title: "Person", left: "back" }) + `<div class="content"><div class="note">Loading…</div></div>`; });
  let p;
  try { p = await loadPerson(slug); } catch (e) {
    el.querySelector(".content").innerHTML = `<div class="empty">Couldn't load episodes. Check your connection.</div>`; return;
  }
  const view = { featured: true, discussed: false, ai: false, seg: "all", open: false };
  const rowsFor = () => {
    const eps = p.episodes.filter((ep) => (ep.ai ? view.ai : (ep.g === "f" ? view.featured : view.discussed)))
      .map((ep) => mkRow(ep, p.showList[ep.s], { person: { slug, name: p.name } }));
    if (view.seg === "listen") return isFollowed(slug) ? eps.filter((r) => r.grade === "f" && !r.ai) : [];
    return eps;
  };
  const draw = () => {
    const rows = rowsFor();
    const sel = [view.featured && "Featured", view.discussed && "Mentioned", view.ai && "AI"].filter(Boolean).join(", ") || "None";
    const totalKnown = (view.featured ? p.featured : 0) + (view.discussed ? p.mentioned : 0);
    const shown = view.seg === "listen" ? rows.length : Math.max(rows.length, totalKnown);
    const fol = isFollowed(slug);
    const bio = p.bio ? `<div class="desc${view.open ? " open" : ""}"><p>${h(p.bio)}</p>${p.bio.length > 180 && !view.open ? `<button class="more" data-action="more-bio">More</button>` : ""}</div>` : `<div class="desc empty">No cached description yet.</div>`;
    const empty = view.seg === "listen" ? "No appearances in Listen." : "No appearances found.";
    LISTS.person = rows;
    el.innerHTML = header({ title: "Person", left: "back", right: "search" }) + `<div class="content">
      <div class="hero">${img(personImage(slug, p), "portrait", p.name, 80)}<h1>${h(p.name)}</h1>
        ${fol ? `<button class="follow on" data-action="following-menu" data-slug="${h(slug)}">${I.check}Following</button>`
              : `<button class="follow" data-action="follow" data-slug="${h(slug)}">${I.plusCircle}Follow</button>`}</div>
      ${bio}
      <details class="card"${view.open ? "" : ""}><summary>Appearance filter<span class="sum">${h(sel)}${I.chevR}</span></summary>
        <div class="opts"><h4>Relevance</h4>
          <div class="opt"><div><span class="l">Guest appearance</span><span class="s">Episodes that genuinely feature the guest.</span></div><button class="switch" role="switch" aria-checked="${view.featured}" data-toggle="featured" aria-label="Guest appearance"></button></div>
          <div class="opt"><div><span class="l">Discussed</span><span class="s">Episodes where the person is discussed but does not appear.</span></div><button class="switch" role="switch" aria-checked="${view.discussed}" data-toggle="discussed" aria-label="Discussed"></button></div>
          <h4>Machine-made content</h4>
          <div class="opt"><div><span class="l">AI-generated episodes</span></div><button class="switch" role="switch" aria-checked="${view.ai}" data-toggle="ai" aria-label="AI-generated episodes"></button></div></div></details>
      <div class="sechead"><h2>${shown} Appearance${shown === 1 ? "" : "s"}</h2>
        <div class="seg"><button data-seg="listen" aria-pressed="${view.seg === "listen"}">In Listen</button><button data-seg="all" aria-pressed="${view.seg === "all"}">All</button></div></div>
      ${rows.length ? `<ul class="plain" data-list="person" data-opts='{"noPerson":true,"relevance":${view.featured && view.discussed}}'>${rows.slice(0, PAGE).map((r) => rowHTML(r, { noPerson: true, relevance: view.featured && view.discussed })).join("")}</ul>` : `<div class="empty">${empty}</div>`}
      ${rows.length > PAGE ? `<button class="loadmore" data-action="more" data-list="person">Loading more episodes…</button>` : ""}
      ${rows.length && totalKnown > rows.length && view.seg === "all" ? `<div class="note">Showing the newest ${rows.length}. The app keeps loading — ${totalKnown} in the graph as of ${h(p.pulled)}.</div>` : ""}
      <div class="note">Open the full page: <a href="/p/${h(slug)}" target="_top">attunex.app/p/${h(slug)}</a></div>
    </div>`;
    el.querySelectorAll(".switch").forEach((b) => b.addEventListener("click", () => { view[b.dataset.toggle] = !view[b.dataset.toggle]; draw(); el.querySelector("details").open = true; }));
    el.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { view.seg = b.dataset.seg; draw(); }));
    const more = el.querySelector('[data-action="more-bio"]');
    if (more) more.addEventListener("click", () => { view.open = true; draw(); });
  };
  el.draw = draw;
  draw();
}
function followingMenu(anchor, slug) {
  openMenu(anchor, `<button data-v="unfollow" class="destr">Unfollow</button>`, () => { unfollow(slug); });
}
function follow(slug) {
  if (isFollowed(slug)) return;
  if (state.people.length >= FREE_LIMIT) { openPaywall(); return; }
  state.people.push(slug); save(); FEED = []; redrawAll();
  toast(`Following ${personName(slug)}`);
}
function unfollow(slug) { state.people = state.people.filter((s) => s !== slug); save(); FEED = []; redrawAll(); }
function followShow(id) {
  if (isFollowedShow(id)) state.shows = state.shows.filter((s) => s !== id); else state.shows.push(id);
  save(); FEED = []; redrawAll();
}
function redrawAll() {
  refreshFeed().then(() => {
    renderRoot(tab);
    stack.forEach((s) => s.el.draw && s.el.draw());
    sheets.forEach((s) => s.draw && s.draw());
  });
}

// ---------------------------------------------------------------- Show
async function openShow(id, fallbackRows) {
  const el = push("show", (el) => { el.innerHTML = header({ title: "Podcast", left: "back" }) + `<div class="content"><div class="note">Loading…</div></div>`; });
  let s = null;
  try { s = await loadShow(id); } catch (e) { /* not in the demo set */ }
  const meta = s ? { id: s.id, t: s.t, art: s.art } : (fallbackRows && fallbackRows[0] ? fallbackRows[0].show : null);
  if (!meta) { el.querySelector(".content").innerHTML = `<div class="empty">Couldn't load episodes. Check your connection.</div>`; return; }
  const view = { seg: "all" };
  const draw = () => {
    const all = s ? s.episodes.map((ep) => mkRow(ep, meta, { fromShow: true, people: ep.p })) : fallbackRows.slice();
    const fol = isFollowedShow(id);
    const rows = view.seg === "listen" ? (fol ? all : []) : all;
    LISTS.show = rows;
    const sub = s ? `${s.n} episode${s.n === 1 ? "" : "s"} with people in Attunex` : `${all.length} appearance${all.length === 1 ? "" : "s"} found`;
    el.innerHTML = header({ title: "Podcast", left: "back", right: "search" }) + `<div class="content">
      <div class="hero">${img(meta.art, "portrait show", meta.t, 80)}<h1>${h(meta.t)}</h1><div class="author">${h(sub)}</div>
        ${s ? (fol ? `<button class="follow on" data-action="follow-show" data-id="${h(id)}">${I.check}Following</button>` : `<button class="follow" data-action="follow-show" data-id="${h(id)}">${I.plusCircle}Follow</button>`) : `<div class="note" style="padding:0">This show isn't in the preview's data set. Follow it in the app.</div>`}</div>
      <div class="sechead"><h2>Episodes</h2><div class="seg"><button data-seg="listen" aria-pressed="${view.seg === "listen"}">In Listen</button><button data-seg="all" aria-pressed="${view.seg === "all"}">All</button></div></div>
      ${rows.length ? `<ul class="plain" data-list="show" data-opts='{"hideShow":true,"showPeople":true}'>${rows.slice(0, PAGE).map((r) => rowHTML(r, { hideShow: true, showPeople: true })).join("")}</ul>` : `<div class="empty">${view.seg === "listen" ? "No episodes in Listen." : "No episodes found."}</div>`}
      ${rows.length > PAGE ? `<button class="loadmore" data-action="more" data-list="show">Loading more episodes…</button>` : ""}
      ${s && s.n > all.length ? `<div class="note">Showing the newest ${all.length} of ${s.n}. The app loads the podcast's own feed.</div>` : ""}
    </div>`;
    el.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { view.seg = b.dataset.seg; draw(); }));
  };
  el.draw = draw;
  draw();
}

// ---------------------------------------------------------------- Search
function openSearch(initial = "") {
  let q = initial, scope = "all", first = true;
  const el = openSheet("search", () => {});
  const draw = (keepFocus) => {
    const nq = norm(q.trim());
    const tokens = nq.split(/\s+/).filter(Boolean);
    const hit = (s) => { const n = norm(s); return tokens.every((t) => n.includes(t)); };
    let html = "";
    if (!tokens.length) {
      const starters = DIR.filter((p) => !isFollowed(p.slug)).slice(0, 6);
      const shows = SHOWS.filter((s) => !isFollowedShow(s.id)).slice(0, 6);
      html = `${state.recent.length ? `<div class="secttl">Recent<button data-action="clear-recent">Clear</button></div><div class="recent">${state.recent.map((r) => `<button data-action="recent" data-q="${h(r)}">${h(r)}</button>`).join("")}</div>` : ""}
        <div class="secttl"><span>People to follow<br><small>Find their appearances across podcasts</small></span></div>
        <div class="group">${starters.map(personRow).join("")}</div>
        <div class="secttl">Podcasts to explore</div>
        <div class="group">${shows.map(showRow).join("")}</div>`;
    } else {
      const people = DIR.filter((p) => hit(p.name) || hit(p.bio)).sort((a, b) => (norm(b.name).startsWith(nq) - norm(a.name).startsWith(nq)) || (b.appearances - a.appearances));
      const shows = SHOWS.filter((s) => hit(s.t));
      const eps = FEED.filter((r) => hit(r.t) || hit(r.show.t)).sort((a, b) => b.d.localeCompare(a.d));
      const total = people.length + shows.length + eps.length;
      const cap = scope === "all" ? 4 : Infinity;
      const chipsHTML = [["all", "All", total], ["people", "People", people.length], ["shows", "Shows", shows.length], ["episodes", "Episodes", eps.length]]
        .map(([k, l, n]) => `<button data-scope="${k}" aria-pressed="${scope === k}">${l}<b>${n}</b></button>`).join("");
      const sec = (title, n, key, body) => (n && (scope === "all" || scope === key)) ? `<div class="secttl">${title}${n > cap ? `<button data-scope="${key}">See all ${n}</button>` : ""}</div>${body}` : "";
      html = `<div class="scopes">${chipsHTML}</div>` +
        sec("People", people.length, "people", people[0] && scope !== "episodes" && scope !== "shows" ? personCard(people[0]) + (people.length > 1 ? `<div class="group">${people.slice(1, cap).map(personRow).join("")}</div>` : "") : "") +
        sec("Shows", shows.length, "shows", `<div class="group">${shows.slice(0, cap).map(showRow).join("")}</div>`) +
        sec("Episodes", eps.length, "episodes", `<ul class="group" data-list="search">${eps.slice(0, cap === Infinity ? 60 : cap).map((r) => rowHTML(r, { compact: true })).join("")}</ul>`) +
        (total ? "" : `<div class="empty">No matches. Try another name, or search in the app.<div class="note">This preview searches the people in the graph and the episodes you follow.</div></div>`);
      LISTS.search = eps;
    }
    el.innerHTML = `<div class="grab"></div><div class="hdr"><h1 class="big title">Search</h1><button class="done" data-action="close">Done</button></div>
      <div class="field">${I.search}<input type="search" placeholder="Search guests, podcasts, or what was said" value="${h(q)}" aria-label="Search" autocomplete="off" autocapitalize="off">${q ? `<button class="clear" data-action="clear-q" aria-label="Clear">${I.xCircle}</button>` : ""}</div>
      <div class="content">${html}</div>`;
    const input = el.querySelector("input");
    input.addEventListener("input", () => { q = input.value; scope = "all"; draw(true); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && q.trim()) remember(q.trim()); });
    el.querySelectorAll("[data-scope]").forEach((b) => b.addEventListener("click", () => { scope = b.dataset.scope; draw(); }));
    if (keepFocus || first) { input.focus({ preventScroll: true }); const v = input.value; input.value = ""; input.value = v; }
    first = false;
  };
  el.draw = draw;
  draw();
  function remember(term) { state.recent = [term, ...state.recent.filter((r) => r !== term)].slice(0, 5); save(); }
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]"); if (!b) return;
    if (b.dataset.action === "clear-q") { q = ""; draw(true); }
    if (b.dataset.action === "recent") { q = b.dataset.q; draw(); }
    if (b.dataset.action === "clear-recent") { state.recent = []; save(); draw(); }
    if (b.dataset.action === "person" || b.dataset.action === "show") { if (q.trim()) remember(q.trim()); }
  });
}
function personCard(p) {
  const fol = isFollowed(p.slug);
  return `<div class="pcard">${img(p.image, "avatar", p.name, 60)}<div class="n">${h(p.name)}</div><div class="b">${h(p.bio)}</div>
    <div class="acts"><button class="f${fol ? " on" : ""}" data-action="${fol ? "unfollow" : "follow"}" data-slug="${h(p.slug)}">${fol ? I.check + "Following" : "Follow"}</button>
    <button class="see" data-action="person" data-slug="${h(p.slug)}">See appearances ${I.chevR}</button></div></div>`;
}
function personRow(p) {
  const fol = isFollowed(p.slug);
  return `<div class="prow"><button class="prowtap" data-action="person" data-slug="${h(p.slug)}" aria-label="${h(p.name)}"></button>${img(p.image, "av", p.name, 44)}
    <div class="tx"><b>${h(p.name)}</b><span>${h(p.bio)}</span></div>
    <button class="fb${fol ? " on" : ""}" data-action="${fol ? "unfollow" : "follow"}" data-slug="${h(p.slug)}">${fol ? I.check + "Following" : "Follow"}</button></div>`;
}
function showRow(s) {
  const fol = isFollowedShow(s.id);
  return `<div class="prow"><button class="prowtap" data-action="show" data-id="${h(s.id)}" aria-label="${h(s.t)}"></button>${img(s.art, "av", s.t, 44)}
    <div class="tx"><b>${h(s.t)}</b><span>${s.n} episode${s.n === 1 ? "" : "s"} with people in Attunex</span></div>
    ${fol ? `<span class="st">${I.checkCircle}Following</span>` : ""}${I.chevR.replace("<svg", '<svg class="chev"')}</div>`;
}

// ---------------------------------------------------------------- Following sheet
function openFollowing() {
  const el = openSheet("following", () => {});
  const draw = () => {
    const people = state.people.map((s) => DIR_BY_SLUG.get(s)).filter(Boolean);
    const shows = state.shows.map((id) => SHOWS_BY_ID.get(id)).filter(Boolean);
    el.innerHTML = `<div class="grab"></div><div class="hdr"><h1 class="big title">Following</h1><button class="done" data-action="close">Done</button></div>
      <div class="content">
        <div class="note">Free follows up to ${FREE_LIMIT} people at once. Pro makes it unlimited.</div>
        <div class="secttl">People <small>${people.length} of ${FREE_LIMIT} active</small></div>
        ${people.length ? `<div class="group">${people.map(personRow).join("")}</div>` : `<div class="empty">No people yet.</div>`}
        <div class="secttl">Shows <small>${shows.length}</small></div>
        ${shows.length ? `<div class="group">${shows.map(showRow).join("")}</div>` : `<div class="empty">No shows yet.</div>`}
        <div class="empty"><button class="cta" data-action="search">Find more to follow</button></div>
      </div>`;
  };
  el.draw = draw; draw();
}

// ---------------------------------------------------------------- Paywall
function openPaywall() {
  const el = openSheet("paywall", () => {});
  el.innerHTML = `<div class="grab"></div><div class="hdr"><span class="round plain"></span><div class="title"></div><button class="done" data-action="close">Not now</button></div>
    <div class="content pay">
      <div class="eyebrow">Attunex Pro</div>
      <h1>Follow everyone you want</h1>
      <div class="callout">The free plan follows up to ${FREE_LIMIT} people at once. Pro makes it unlimited.</div>
      <div class="ben">${I.people}<div><b>Follow unlimited people</b><span>The free version keeps up with ${FREE_LIMIT} people at a time. Pro removes the limit.</span></div></div>
      <div class="ben">${I.person}<div><b>Separate profiles</b><span>Each profile keeps its own follows, history, and settings.</span></div></div>
      <div class="price">$2.99 a month or $29.99 a year, after a free trial. Subscriptions run through the App Store.</div>
      <a class="cta" href="${APP_STORE}" target="_top">Get Attunex on the App Store</a>
      <button class="later" data-action="close">Keep the preview free</button>
    </div>`;
}

// ---------------------------------------------------------------- Settings
function openSettings() {
  const el = push("settings", () => {});
  const draw = () => {
    const themeName = { ember: "Ember", paper: "Paper", sepia: "Sepia", night: "Night" }[state.theme] || "Ember";
    el.innerHTML = header({ title: "Settings", left: "back" }) + `<div class="content set">
      <div class="profile"><span class="pv">D</span><div><b>Default</b><span>1 profile · Free</span></div></div>
      <h5>Your library</h5>
      <div class="group">
        <button class="srow" data-action="following"><span class="ic">${I.people}</span><span class="l">Following<small>${state.people.length} people · ${state.shows.length} show${state.shows.length === 1 ? "" : "s"}</small></span>${I.chevR.replace("<svg", '<svg class="chev"')}</button>
        <button class="srow" data-action="toast" data-msg="Downloads live on your iPhone. The web preview streams."><span class="ic">${I.download}</span><span class="l">Downloads</span><span class="v">On your iPhone</span>${I.chevR.replace("<svg", '<svg class="chev"')}</button>
      </div>
      <h5>Preferences</h5>
      <div class="group">
        <button class="srow" data-action="playback"><span class="ic">${I.play}</span><span class="l">Playback</span><span class="v">${state.speed}× · ${state.skipBack}s · ${state.skipFwd}s</span>${I.chevR.replace("<svg", '<svg class="chev"')}</button>
        <button class="srow" data-action="appearance"><span class="ic">${I.palette}</span><span class="l">Appearance</span><span class="v">${themeName}</span>${I.chevR.replace("<svg", '<svg class="chev"')}</button>
        <button class="srow" data-action="toast" data-msg="The app follows your iPhone's language. The preview is in English."><span class="ic">${I.globe}</span><span class="l">Language</span><span class="v">English</span>${I.chevR.replace("<svg", '<svg class="chev"')}</button>
      </div>
      <h5>Account</h5>
      <div class="group">
        <button class="srow" data-action="toast" data-msg="Backups sync through your private iCloud on the iPhone."><span class="ic">${I.cloud}</span><span class="l">Backup</span><span class="v">iCloud</span>${I.chevR.replace("<svg", '<svg class="chev"')}</button>
        <button class="srow" data-action="paywall"><span class="ic">${I.star}</span><span class="l">Attunex Pro<small>Pro lets you follow more people — plus separate profiles.</small></span><span class="badge">PRO</span>${I.chevR.replace("<svg", '<svg class="chev"')}</button>
      </div>
      <div class="foot">Attunex 1.6 · web preview on real data<br><button class="loadmore" data-action="reset">Reset the preview</button></div>
    </div>`;
  };
  el.draw = draw; draw();
}
function openPlayback() {
  const el = push("playback", () => {});
  const draw = () => {
    el.innerHTML = header({ title: "Playback", left: "back" }) + `<div class="content set">
      <div class="group">
        <button class="srow" data-action="speed-menu"><span class="l">Default Speed</span><span class="pill-btn">${state.speed}×</span></button>
        <button class="srow" data-action="skip-menu" data-k="skipBack"><span class="l">Skip Back</span><span class="v">${state.skipBack}s</span>${I.chevR.replace("<svg", '<svg class="chev"')}</button>
        <button class="srow" data-action="skip-menu" data-k="skipFwd"><span class="l">Skip Forward</span><span class="v">${state.skipFwd}s</span>${I.chevR.replace("<svg", '<svg class="chev"')}</button>
      </div>
      <div class="note">Remote controls, CarPlay, and downloads are on the iPhone.</div></div>`;
  };
  el.draw = draw; draw();
}
function openAppearance() {
  const el = push("appearance", () => {});
  const sw = { ember: "#F6F1EC", paper: "#F4EFE5", sepia: "#F0E4C8", night: "#131211" };
  const draw = () => {
    el.innerHTML = header({ title: "Appearance", left: "back" }) + `<div class="content set">
      <h5>Theme</h5>
      <div class="swatches">${Object.entries(sw).map(([k, c]) => `<button data-theme="${k}" aria-pressed="${state.theme === k}"><i style="--sw:${c}"></i>${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>
      <h5>Text</h5>
      <div class="seg wide">${[["0.9", "A−"], ["1", "A"], ["1.15", "A+"], ["1.3", "A++"]].map(([v, l]) => `<button data-ts="${v}" aria-pressed="${String(state.textScale) === v}">${l}</button>`).join("")}</div>
      <div class="note">The app also offers line spacing, margins, typeface, and density.</div></div>`;
    el.querySelectorAll("[data-theme]").forEach((b) => b.addEventListener("click", () => { state.theme = b.dataset.theme; save(); applyTheme(); draw(); }));
    el.querySelectorAll("[data-ts]").forEach((b) => b.addEventListener("click", () => { state.textScale = Number(b.dataset.ts); save(); applyTheme(); draw(); }));
  };
  el.draw = draw; draw();
}

// ---------------------------------------------------------------- player
const player = { row: null, queue: [], pendingSeek: 0 };
function playRow(r, queue) {
  if (player.row && player.row.id === r.id) { togglePlay(); return; }
  if (!r.a) { toast("No audio file for this episode."); return; }
  player.row = r;
  if (queue) player.queue = queue;
  const pos = state.progress[r.id] || 0;
  player.pendingSeek = pos > 5 && pos < (r.dur || Infinity) - 15 ? pos : 0;
  audio.src = r.a.replace(/^http:\/\//, "https://");
  audio.playbackRate = state.speed;
  audio.play().catch(() => { toast("Couldn't play this episode here. It plays in the app."); });
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: r.t, artist: r.show.t, artwork: r.show.art ? [{ src: r.show.art }] : [] }); } catch (e) { /* ignore */ }
  }
  drawMini(); refreshPills();
  const np = sheets.find((s) => s.classList.contains("np")); if (np) np.draw();
}
function togglePlay() { if (!player.row) return; if (audio.paused) audio.play().catch(() => toast("Couldn't play this episode here.")); else audio.pause(); }
function seekBy(delta) { if (!player.row) return; audio.currentTime = Math.max(0, Math.min((audio.duration || player.row.dur || 0), audio.currentTime + delta)); }
function playNext() {
  const q = player.queue, i = q.findIndex((r) => r.id === player.row.id);
  const next = q.slice(i + 1).find((r) => r.a);
  if (next) playRow(next); else toast("End of the queue.");
}
function setSpeed(v) { state.speed = v; save(); audio.playbackRate = v; drawMini(); const np = sheets.find((s) => s.classList.contains("np")); if (np) np.draw(); }
let lastSaved = 0;
audio.addEventListener("loadedmetadata", () => { if (player.pendingSeek) { audio.currentTime = player.pendingSeek; player.pendingSeek = 0; } });
audio.addEventListener("timeupdate", () => {
  if (!player.row) return;
  const now = Date.now();
  if (now - lastSaved > 4000) { state.progress[player.row.id] = audio.currentTime; save(); lastSaved = now; }
  tick();
});
audio.addEventListener("play", () => { drawMini(); refreshPills(); tickNP(true); });
audio.addEventListener("pause", () => { if (player.row) { state.progress[player.row.id] = audio.currentTime; save(); } drawMini(); refreshPills(); tickNP(true); });
audio.addEventListener("ended", () => { if (player.row) { delete state.progress[player.row.id]; save(); } playNext(); });
audio.addEventListener("error", () => { if (player.row && audio.src) toast("This episode's audio didn't load in the browser. It plays in the app."); });
function tick() {
  const r = player.row; if (!r) return;
  const dur = audio.duration || r.dur || 0, pos = audio.currentTime;
  const p = dur ? Math.min(1, pos / dur) : 0;
  if (miniEl) { miniEl.style.setProperty("--p", p.toFixed(4)); const t = miniEl.querySelector(".tx span"); if (t) t.textContent = `${fmtClock(pos)} · -${fmtClock(dur - pos)}`; }
  const pill = app.querySelector(`.row[data-ep="${CSS.escape(r.id)}"] .pill`);
  if (pill) { pill.style.setProperty("--p", p.toFixed(3)); pill.querySelector("span").textContent = `-${fmtClock(dur - pos)}`; }
  tickNP(false);
}
function tickNP(full) {
  const np = sheets.find((s) => s.classList.contains("np")); if (!np) return;
  if (full) { np.draw(); return; }
  const r = player.row; if (!r || np.row.id !== r.id) return;
  const dur = audio.duration || r.dur || 0, pos = audio.currentTime;
  const s = np.querySelector(".slider"); if (s && !np.scrubbing) { s.value = dur ? (pos / dur) * 1000 : 0; s.style.setProperty("--p", dur ? (pos / dur).toFixed(4) : 0); }
  const t = np.querySelectorAll(".times span"); if (t.length) { t[0].textContent = fmtClock(pos); t[1].textContent = dur ? `-${fmtClock(dur - pos)}` : "--:--"; }
}
function drawMini() {
  const r = player.row;
  miniEl.hidden = !r;
  if (!r) return;
  const playing = !audio.paused;
  const dur = audio.duration || r.dur || 0;
  miniEl.innerHTML = `<button class="minitap" data-action="now-playing" aria-label="Now Playing"></button>${img(r.show.art, "art", r.show.t, 44)}
    <div class="tx"><small>${h(r.show.t)}</small><b>${h(r.t)}</b><span>${fmtClock(audio.currentTime)} · -${fmtClock(dur - audio.currentTime)}</span></div>
    <div class="ctl"><button class="sk" data-action="skip-fwd" aria-label="Skip forward ${state.skipFwd} seconds">${skipIcon(state.skipFwd, false)}</button>
    <button class="pp" data-action="toggle" aria-label="${playing ? "Pause" : "Play"}">${playing ? I.pauseCircle : I.playCircle}</button></div><div class="prog"></div>`;
  miniEl.style.setProperty("--p", dur ? (audio.currentTime / dur).toFixed(4) : 0);
}
function openNowPlaying(r) {
  r = r || player.row; if (!r) return;
  const el = openSheet("np", () => {}); el.row = r;
  let pane = "description";
  const draw = () => {
    const cur = player.row && player.row.id === r.id;
    const playing = cur && !audio.paused;
    const pos = cur ? audio.currentTime : (state.progress[r.id] || 0);
    const dur = (cur && audio.duration) || r.dur || 0;
    const ctx = r.person ? `<span class="chip person">${I.person}Featuring ${h(r.person.name)}</span>` : (r.people && r.people.length ? r.people.map((s) => `<span class="chip person">${I.person}Featuring ${h(personName(s))}</span>`).join(" ") : "");
    const paneHTML = pane === "description"
      ? (r.n ? `<div class="pane">${h(r.n)} <span style="color:var(--sec)">… full notes in the app.</span></div>` : `<div class="pane dim">No description from the publisher.</div>`)
      : `<div class="pane dim">${I.sparkles}<b style="display:block;color:var(--ink);font-family:var(--sans);font-size:14px;margin:6px 0 4px">No transcript yet</b>Attunex transcribes on your iPhone while it charges. Tap Read there to open it as an article.</div>`;
    el.innerHTML = `<div class="grab"></div>${header({ title: cur ? "Now Playing" : "Episode", left: "", right: "close" })}
      <div class="content">
        <div class="top"><button data-action="show" data-id="${h(r.show.id)}" aria-label="${h(r.show.t)}">${img(r.show.art, "art", r.show.t, 64)}</button>
          <div><small class="link"><button data-action="show" data-id="${h(r.show.id)}">${h(r.show.t)}</button></small><b>${h(r.t)}</b><span>${h(fmtDate(r.d))} · ${fmtDur(dur || r.dur)}</span></div></div>
        ${ctx ? `<div class="ctx">${ctx}</div>` : ""}
        <div class="seg wide"><button data-pane="description" aria-pressed="${pane === "description"}">Description</button><button data-pane="transcript" aria-pressed="${pane === "transcript"}">Transcript</button></div>
        ${paneHTML}
        ${r.a ? "" : `<div class="note">No audio file was published for this episode.</div>`}
      </div>
      <div class="bottom">
        <input class="slider" type="range" min="0" max="1000" value="${dur ? Math.round((pos / dur) * 1000) : 0}" style="--p:${dur ? (pos / dur).toFixed(4) : 0}" aria-label="Position" ${r.a ? "" : "disabled"}>
        <div class="times"><span>${fmtClock(pos)}</span><span>${dur ? `-${fmtClock(dur - pos)}` : "--:--"}</span></div>
        <div class="controls">
          <button class="sk" data-action="skip-back" aria-label="Skip back ${state.skipBack} seconds">${skipIcon(state.skipBack, true)}</button>
          <button class="pp" data-action="play-np" aria-label="${playing ? "Pause" : "Play"}">${playing ? I.pauseCircle : I.playCircle}</button>
          <button class="sk" data-action="skip-fwd" aria-label="Skip forward ${state.skipFwd} seconds">${skipIcon(state.skipFwd, false)}</button>
        </div>
        <div class="subctl"><button class="pill-btn" data-action="speed-menu">Speed ${state.speed}×</button><button class="dl" data-action="toast" data-msg="Downloads are saved on your iPhone for offline listening.">${I.download}Download</button></div>
      </div>`;
    el.querySelectorAll("[data-pane]").forEach((b) => b.addEventListener("click", () => { pane = b.dataset.pane; draw(); }));
    const s = el.querySelector(".slider");
    s.addEventListener("input", () => { el.scrubbing = true; const t = el.querySelectorAll(".times span"); const d = (player.row && player.row.id === r.id && audio.duration) || r.dur || 0; t[0].textContent = fmtClock((s.value / 1000) * d); s.style.setProperty("--p", (s.value / 1000).toFixed(4)); });
    s.addEventListener("change", () => { el.scrubbing = false; const d = (player.row && player.row.id === r.id && audio.duration) || r.dur || 0; if (player.row && player.row.id === r.id) audio.currentTime = (s.value / 1000) * d; else { state.progress[r.id] = (s.value / 1000) * d; save(); } });
  };
  el.draw = draw; draw();
}
function speedMenu(anchor) {
  openMenu(anchor, `<h5>Speed</h5><div class="speeds">${SPEEDS.map((v) => `<button data-v="${v}" aria-pressed="${state.speed === v}">${v}×</button>`).join("")}</div><div class="note" style="padding:0 12px 8px">The app also has a 0.5×–3× lever.</div>`,
    (b) => { if (b.dataset.v) setSpeed(Number(b.dataset.v)); stack.forEach((s) => s.el.draw && s.el.draw()); });
}
function skipMenu(anchor, k) {
  openMenu(anchor, SKIPS.map((v) => `<button data-v="${v}">${v} seconds ${state[k] === v ? I.check : ""}</button>`).join(""),
    (b) => { state[k] = Number(b.dataset.v); save(); drawMini(); stack.forEach((s) => s.el.draw && s.el.draw()); });
}

// ---------------------------------------------------------------- actions
app.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]"); if (!b || !app.contains(b)) return;
  const a = b.dataset.action;
  if (b.tagName === "A") return;
  switch (a) {
    case "back": pop(); break;
    case "close": { const sh = b.closest(".sheet"); if (sh) closeSheet(sh); break; }
    case "settings": openSettings(); break;
    case "search": { const sh = b.closest(".sheet"); if (sh && !sh.classList.contains("search")) closeSheet(sh); if (!sheets.some((s) => s.classList.contains("search"))) openSearch(); break; }
    case "following": openFollowing(); break;
    case "feed-menu": feedMenu(b); break;
    case "read-menu": readMenu(b); break;
    case "more": appendMore(b); break;
    case "person": { const sh = b.closest(".sheet"); if (sh) closeSheet(sh); openPerson(b.dataset.slug); break; }
    case "show": { const sh = b.closest(".sheet"); if (sh) closeSheet(sh); const rows = b.dataset.id ? Object.values(LISTS).flat().filter((r) => r.show.id === b.dataset.id) : []; openShow(b.dataset.id, rows); break; }
    case "follow": follow(b.dataset.slug); break;
    case "unfollow": unfollow(b.dataset.slug); break;
    case "following-menu": followingMenu(b, b.dataset.slug); break;
    case "follow-show": followShow(b.dataset.id); break;
    case "play": { const r = ROWS.get(b.dataset.ep); const ul = b.closest("[data-list]"); playRow(r, ul ? LISTS[ul.dataset.list] : null); break; }
    case "episode": { const r = ROWS.get(b.dataset.ep); if (r) { const ul = b.closest("[data-list]"); if (ul) player.queue = LISTS[ul.dataset.list] || player.queue; openNowPlaying(r); } break; }
    case "read": { const r = b.dataset.ep === SAMPLE.id ? SAMPLE : ROWS.get(b.dataset.ep); if (r) openReader(r); break; }
    case "now-playing": openNowPlaying(); break;
    case "toggle": togglePlay(); break;
    case "play-np": { const np = b.closest(".sheet"); const r = np.row; if (player.row && player.row.id === r.id) togglePlay(); else playRow(r, player.queue); break; }
    case "skip-back": seekBy(-state.skipBack); break;
    case "skip-fwd": seekBy(state.skipFwd); break;
    case "speed-menu": speedMenu(b); break;
    case "skip-menu": skipMenu(b, b.dataset.k); break;
    case "playback": openPlayback(); break;
    case "appearance": openAppearance(); break;
    case "paywall": openPaywall(); break;
    case "text-size": openMenu(b, `<h5>Text size</h5>${[["0.9", "Smaller"], ["1", "Default"], ["1.15", "Larger"], ["1.3", "Largest"]].map(([v, l]) => `<button data-v="${v}">${l} ${String(state.textScale) === v ? I.check : ""}</button>`).join("")}`, (m) => { state.textScale = Number(m.dataset.v); save(); applyTheme(); }); break;
    case "toast": toast(b.dataset.msg); break;
    case "reset": { localStorage.removeItem(KEY); state = defaults(); applyTheme(); audio.pause(); audio.removeAttribute("src"); player.row = null; drawMini(); while (stack.length) pop(); sheets.slice().forEach(closeSheet); FEED = []; setTab("listen", true); toast("Preview reset"); break; }
    default: break;
  }
});
app.addEventListener("error", (e) => {
  const im = e.target; if (!(im instanceof HTMLImageElement) || !im.dataset.name) return;
  const d = document.createElement("div"); d.className = `${im.className} mono`; d.style.background = hue(im.dataset.name); d.textContent = initials(im.dataset.name);
  im.replaceWith(d);
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (app.querySelector(".menu")) closeMenu(); else if (sheets.length) closeTopSheet(); else pop(); } });
window.addEventListener("resize", layout);

// ---------------------------------------------------------------- boot
async function boot() {
  applyTheme(); layout();
  try {
    const [dir, shows] = await Promise.all([getJSON("/people/directory.v1.json"), getJSON("/demo/data/shows.json")]);
    DIR = dir.map((p) => Object.assign({}, p, { slug: p.url.split("/").pop() }));
    DIR_BY_SLUG = new Map(DIR.map((p) => [p.slug, p]));
    SHOWS = shows; SHOWS_BY_ID = new Map(shows.map((s) => [s.id, s]));
  } catch (e) {
    app.innerHTML = `<div class="boot">The preview couldn't load its data. Please reload.</div>`; return;
  }
  state.people = state.people.filter((s) => DIR_BY_SLUG.has(s));
  state.shows = state.shows.filter((id) => SHOWS_BY_ID.has(id));
  app.innerHTML = `<div id="screens"></div><div id="mini" class="mini" hidden></div>
    <div id="tabs" class="tabs" role="tablist"><button role="tab" data-tab="listen" aria-selected="true">${I.headphones}Listen</button><button role="tab" data-tab="read" aria-selected="false">${I.book}Read</button></div>`;
  screensEl = document.getElementById("screens"); miniEl = document.getElementById("mini"); tabsEl = document.getElementById("tabs");
  for (const k of ["listen", "read"]) { const el = document.createElement("div"); el.className = "screen"; el.dataset.kind = k; el.hidden = true; screensEl.append(el); roots[k] = el; }
  tabsEl.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) { sheets.slice().forEach(closeSheet); setTab(b.dataset.tab); } });
  setTab("listen", true);
  if (Q.get("p") && DIR_BY_SLUG.has(Q.get("p"))) openPerson(Q.get("p"));
  else if (Q.get("s") && SHOWS_BY_ID.has(Q.get("s"))) openShow(Q.get("s"));
}
boot();
})();
