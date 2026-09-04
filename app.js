/* Attunex site — shared client script.
 * 1) A persistent mini-player (audio never unloads).
 * 2) Soft navigation: internal links swap page content without a full reload,
 *    so playback continues across person pages and the parent site.
 * 3) Per-page init (idempotent), re-run after each soft-nav.
 * Loaded on every page via <script src="/app.js" defer>. No dependencies.
 */
(function () {
  "use strict";

  var PLAY_CHAR = "\u25B6"; // ▶
  var RPAUSE = '<svg viewBox="0 0 24 24" width="9" height="9" style="vertical-align:middle"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>';
  var PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  var PAUSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  var PLAYER_CSS =
    ".mini[hidden]{display:none}" +
    ".mini{position:fixed;left:0;right:0;bottom:0;background:rgba(250,249,248,0.98);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-top:1px solid var(--line,#ececee);box-shadow:0 -4px 24px rgba(0,0,0,0.08);z-index:50}" +
    ".mini .inner{max-width:720px;margin:0 auto;padding:0.95rem 24px 1.15rem}" +
    ".mini-top{display:flex;align-items:center;gap:0.8rem}" +
    ".mini-art{width:54px;height:54px;border-radius:10px;object-fit:cover;background:var(--line,#ececee);flex:0 0 auto}" +
    ".mini-meta{min-width:0;flex:1 1 auto}" +
    ".mini-title{font-weight:600;font-size:0.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".mini-show{font-size:0.82rem;color:var(--muted,#6b6b70);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:0.05rem}" +
    ".mini-skip{background:none;border:none;cursor:pointer;color:var(--ink,#1c1c1e);flex:0 0 auto;padding:4px;display:flex;align-items:center}" +
    ".mini-skip svg{width:30px;height:30px}" +
    ".mini-play{flex:0 0 auto;width:54px;height:54px;border-radius:50%;background:var(--accent,#e2562b);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center}" +
    ".mini-play svg{width:24px;height:24px;fill:#fff}" +
    ".mini-close{flex:0 0 auto;background:none;border:none;color:var(--muted,#6b6b70);font-size:1.35rem;line-height:1;cursor:pointer;padding:0 0.15rem}" +
    ".mini-bar{display:flex;align-items:center;gap:0.6rem;margin-top:0.75rem}" +
    ".mini-time{font-size:0.74rem;color:var(--muted,#6b6b70);font-variant-numeric:tabular-nums;flex:0 0 auto;min-width:38px}" +
    ".mini-time.rem{text-align:right}" +
    ".mini-seek{flex:1 1 auto;accent-color:var(--accent,#e2562b);height:4px}";

  var PLAYER_HTML =
    '<div class="mini" id="mini" hidden data-keep><div class="inner">' +
    '<div class="mini-top">' +
    '<img class="mini-art" id="m-art" alt="">' +
    '<div class="mini-meta"><div class="mini-title" id="m-title"></div><div class="mini-show" id="m-show"></div></div>' +
    '<button class="mini-skip" id="m-back" aria-label="Back 30 seconds"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12a7 7 0 1 0 2.05-4.95" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3.5 4.5 5 8 8.4 6.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor">30</text></svg></button>' +
    '<button class="mini-play" id="m-play" aria-label="Play or pause"></button>' +
    '<button class="mini-skip" id="m-fwd" aria-label="Forward 90 seconds"><svg viewBox="0 0 24 24" fill="none"><path d="M19 12a7 7 0 1 1-2.05-4.95" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M20.5 4.5 19 8 15.6 6.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor">90</text></svg></button>' +
    '<button class="mini-close" id="m-close" aria-label="Close player">&times;</button>' +
    "</div>" +
    '<div class="mini-bar"><span class="mini-time" id="m-cur">0:00</span><input class="mini-seek" id="m-seek" type="range" min="0" max="1000" value="0" aria-label="Seek"><span class="mini-time rem" id="m-rem"></span></div>' +
    "</div></div>" +
    '<audio id="player" preload="none" data-keep></audio>';

  var A, mini, mPlay, mArt, mTitle, mShow, mCur, mRem, mSeek;
  var curUrl = null, seeking = false;
  var timers = [];

  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x;
  }
  function total() {
    var d = A.duration;
    return d && isFinite(d) && d > 0 ? d : A._dur || 0;
  }
  function miniIcon() { mPlay.innerHTML = A.paused ? PLAY_SVG : PAUSE_SVG; }

  function refreshPills() {
    var pills = document.querySelectorAll(".playbtn");
    for (var i = 0; i < pills.length; i++) {
      var b = pills[i], on = curUrl && b.getAttribute("data-audio") === curUrl;
      b.classList.toggle("active", !!on);
      var li = b.closest("li"); if (li) li.classList.toggle("playing", !!on);
      var g = b.querySelector(".g"), t = b.querySelector(".t");
      if (on) {
        if (g) g.innerHTML = A.paused ? PLAY_CHAR : RPAUSE;
        if (t) t.textContent = fmt(Math.max(0, total() - A.currentTime));
      } else {
        if (g) g.innerHTML = PLAY_CHAR;
        if (t) { var d = parseFloat(b.getAttribute("data-dur")) || 0; t.textContent = d ? fmt(d) : "Play"; }
      }
    }
  }

  function load(btn) {
    curUrl = btn.getAttribute("data-audio");
    A.src = curUrl;
    A._dur = parseFloat(btn.getAttribute("data-dur")) || 0;
    mTitle.textContent = btn.getAttribute("data-title") || "";
    mShow.textContent = btn.getAttribute("data-show") || "";
    var art = btn.getAttribute("data-art");
    if (art) { mArt.src = art; mArt.style.visibility = ""; } else { mArt.style.visibility = "hidden"; }
    mini.hidden = false;
    document.body.style.paddingBottom = "150px";
    mCur.textContent = "0:00";
    mRem.textContent = A._dur ? "-" + fmt(A._dur) : "";
    mSeek.value = "0";
    A.play();
    refreshPills();
  }

  function onPill(b) {
    if (b.getAttribute("data-audio") === curUrl) { A.paused ? A.play() : A.pause(); }
    else { load(b); }
  }

  function buildPlayer() {
    if (!document.getElementById("ax-player-css")) {
      var st = document.createElement("style");
      st.id = "ax-player-css";
      st.setAttribute("data-keep", "");
      st.textContent = PLAYER_CSS;
      document.head.appendChild(st);
    }
    if (!document.getElementById("mini")) {
      var host = document.createElement("div");
      host.innerHTML = PLAYER_HTML;
      while (host.firstChild) document.body.appendChild(host.firstChild);
    }
    A = document.getElementById("player");
    mini = document.getElementById("mini");
    mPlay = document.getElementById("m-play");
    mArt = document.getElementById("m-art");
    mTitle = document.getElementById("m-title");
    mShow = document.getElementById("m-show");
    mCur = document.getElementById("m-cur");
    mRem = document.getElementById("m-rem");
    mSeek = document.getElementById("m-seek");

    mPlay.addEventListener("click", function () { A.paused ? A.play() : A.pause(); });
    document.getElementById("m-back").addEventListener("click", function () { A.currentTime = Math.max(0, A.currentTime - 30); });
    document.getElementById("m-fwd").addEventListener("click", function () { A.currentTime = Math.min(total() || 1e9, A.currentTime + 90); });
    document.getElementById("m-close").addEventListener("click", function () {
      A.pause(); A.removeAttribute("src"); A.load();
      mini.hidden = true; document.body.style.paddingBottom = ""; curUrl = null; refreshPills();
    });
    A.addEventListener("play", function () { miniIcon(); refreshPills(); });
    A.addEventListener("pause", function () { miniIcon(); refreshPills(); });
    A.addEventListener("ended", function () { refreshPills(); });
    A.addEventListener("timeupdate", function () {
      var T = total();
      mCur.textContent = fmt(A.currentTime);
      mRem.textContent = T ? "-" + fmt(Math.max(0, T - A.currentTime)) : "";
      if (T && !seeking) mSeek.value = String(Math.round((A.currentTime / T) * 1000));
      if (curUrl && T) {
        var pills = document.querySelectorAll('.playbtn[data-audio="' + cssEscape(curUrl) + '"] .t');
        for (var i = 0; i < pills.length; i++) pills[i].textContent = fmt(Math.max(0, T - A.currentTime));
      }
    });
    mSeek.addEventListener("input", function () { seeking = true; });
    mSeek.addEventListener("change", function () { var T = total(); if (T) A.currentTime = (mSeek.value / 1000) * T; seeking = false; });
    miniIcon();
  }

  function cssEscape(s) { return s.replace(/["\\]/g, "\\$&"); }

  /* ---- per-page inits (idempotent; run on load and after each soft-nav) ---- */

  function initFilters() {
    var ol = document.getElementById("eps"); if (!ol) return;
    var pills = document.querySelectorAll(".filters .tab");
    var note = document.getElementById("more-note");
    function apply() {
      var controlled = {}, active = {};
      for (var i = 0; i < pills.length; i++) {
        var key = pills[i].getAttribute("data-filter");
        controlled[key] = 1;
        if (pills[i].classList.contains("active")) active[key] = 1;
      }
      var lis = ol.getElementsByTagName("li");
      for (var j = 0; j < lis.length; j++) {
        var c = lis[j].getAttribute("data-ai") === "1" ? "ai" : lis[j].getAttribute("data-grade");
        lis[j].style.display = !controlled[c] || active[c] ? "" : "none";
      }
      if (note) note.style.display = !controlled["featured"] || active["featured"] ? "" : "none";
    }
    for (var k = 0; k < pills.length; k++) {
      pills[k].addEventListener("click", function () {
        var on = this.classList.toggle("active");
        this.setAttribute("aria-pressed", on ? "true" : "false");
        apply();
      });
    }
    apply();
  }

  function initHubSearch() {
    var q = document.getElementById("psearch"); if (!q) return;
    var items = document.querySelectorAll(".hublist li"), nr = document.getElementById("noresults");
    q.addEventListener("input", function () {
      var t = this.value.trim().toLowerCase(), shown = 0;
      for (var i = 0; i < items.length; i++) {
        var m = !t || items[i].getAttribute("data-name").indexOf(t) !== -1;
        items[i].style.display = m ? "" : "none";
        if (m) shown++;
      }
      if (nr) nr.style.display = shown ? "none" : "";
    });
  }

  function initCarousel() {
    var track = document.getElementById("track"); if (!track) return;
    var imgs = track.getElementsByTagName("img"), i = 0;
    function center() {
      if (!document.body.contains(track)) return;
      for (var k = 0; k < imgs.length; k++) imgs[k].classList.toggle("active", k === i);
      var img = imgs[i], carW = track.parentElement.clientWidth;
      track.style.transform = "translateX(" + -(img.offsetLeft + img.offsetWidth / 2 - carW / 2) + "px)";
    }
    window.addEventListener("resize", center);
    window.addEventListener("load", center);
    center();
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) timers.push(setInterval(function () { i = (i + 1) % imgs.length; center(); }, 2600));
  }

  function initPage() {
    for (var i = 0; i < timers.length; i++) clearInterval(timers[i]);
    timers = [];
    initFilters();
    initHubSearch();
    initCarousel();
    refreshPills();
  }

  /* ---- soft navigation ---- */

  function isInternal(a) {
    if (!a || !a.href) return false;
    if (a.origin !== location.origin) return false;
    if (a.hasAttribute("target") || a.hasAttribute("download")) return false;
    var href = a.getAttribute("href") || "";
    if (href.charAt(0) === "#" || href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) return false;
    return true;
  }

  function swapHead(doc) {
    var old = document.head.querySelectorAll('style:not([data-keep]), script[type="application/ld+json"]');
    for (var i = 0; i < old.length; i++) old[i].remove();
    var neu = doc.head.querySelectorAll('style, script[type="application/ld+json"]');
    for (var j = 0; j < neu.length; j++) document.head.appendChild(document.importNode(neu[j], true));
    var d = doc.querySelector('meta[name="description"]'), cur = document.querySelector('meta[name="description"]');
    if (d && cur) cur.setAttribute("content", d.getAttribute("content") || "");
    var can = doc.querySelector('link[rel="canonical"]'), curCan = document.querySelector('link[rel="canonical"]');
    if (can && curCan) curCan.setAttribute("href", can.getAttribute("href") || "");
  }

  function swapBody(doc) {
    var kids = Array.prototype.slice.call(document.body.children);
    var ref = null;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].hasAttribute("data-keep")) { if (!ref) ref = kids[i]; }
      else kids[i].remove();
    }
    var neu = Array.prototype.slice.call(doc.body.children);
    for (var j = 0; j < neu.length; j++) {
      if (neu[j].tagName === "SCRIPT") continue;
      if (neu[j].hasAttribute && neu[j].hasAttribute("data-keep")) continue;
      document.body.insertBefore(document.importNode(neu[j], true), ref);
    }
  }

  var busy = false;
  function navigate(url, push) {
    if (busy) return;
    busy = true;
    fetch(url, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        document.title = doc.title;
        swapHead(doc);
        swapBody(doc);
        if (push) history.pushState({}, "", url);
        window.scrollTo(0, 0);
        initPage();
        busy = false;
      })
      .catch(function () { location.href = url; });
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target;
    var a = t.closest ? t.closest("a") : null;
    if (a && isInternal(a)) { e.preventDefault(); navigate(a.href, true); return; }
    var b = t.closest ? t.closest(".playbtn") : null;
    if (b) onPill(b);
  });

  window.addEventListener("popstate", function () { navigate(location.href, false); });

  function boot() { buildPlayer(); initPage(); }
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
