/* Kronos NASDAQ100 – walk-forward forecast pr. kalendermåned. Data: kronos.json (fra build_kronos.py). Ingen eksterne afhængigheder. */
(function () {
  "use strict";
  var MONTHS = ["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
  var MSHORT = ["jan.","feb.","mar.","apr.","maj","jun.","jul.","aug.","sep.","okt.","nov.","dec."];
  var WDAY = ["søndag","mandag","tirsdag","onsdag","torsdag","fredag","lørdag"];
  var G = "#22C55E", GL = "#4ADE80", R = "#EF4444";
  var D, months = [], cur = 0, tip;

  function num(x, dec) { var s = Math.abs(x).toFixed(dec), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, "."); return (x < 0 && +s !== 0 ? "−" : "") + (dec ? i + "," + p[1] : i); }
  function pct(x, dec, sign) { dec = dec === undefined ? 1 : dec; var pre = sign ? (x > 1e-9 ? "+" : x < -1e-9 ? "−" : "") : (x < -1e-9 ? "−" : ""); return pre + Math.abs(x).toFixed(dec).replace(".", ",") + " %"; }
  function tone(v) { return v > 1e-9 ? "pos" : v < -1e-9 ? "neg" : ""; }
  function pd(s) { var a = s.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function shortD(d) { return d.getDate() + ". " + MSHORT[d.getMonth()]; }
  function longD(d) { return WDAY[d.getDay()] + " " + d.getDate() + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }); }
  function $(id) { var e = document.getElementById(id); if (!e) { console.warn("Kronos: #" + id + " mangler"); e = document.createElement("div"); } return e; }
  function safe(name, fn) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (err) {
        console.error("Kronos: fejl i " + name, err);
        if (!document.getElementById("renderNote")) { var n = document.createElement("div"); n.id = "renderNote"; n.className = "rnote"; n.textContent = "En del af siden kunne ikke vises. Genindlæs siden."; document.body.appendChild(n); }
      }
    };
  }
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight, vw = window.innerWidth;
    var lx = x + 14; if (lx + w > vw - 6) lx = x - w - 14; if (lx < 6) lx = 6;
    var ly = y - h - 12; if (ly < 6) ly = y + 16;
    tip.style.left = lx + "px"; tip.style.top = ly + "px";
  }
  function hideTip() { tip.hidden = true; }
  function dir(p50, prev, c) { var a = p50 - prev, b = c - prev; return a * b > 0 ? 1 : (a === 0 || b === 0) ? 0 : -1; }
  function niceRange(lo, hi) {
    var pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    var raw = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).filter(function (s) { return s >= raw; })[0];
    return {lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step: step};
  }
  function monthKey(y, m) { return y + "-" + String(m + 1).padStart(2, "0"); }

  // ---------- næste handelsdag ----------
  function renderNext() {
    var n = D.next, box = $("nextBox");
    if (!n || !n.q) { box.innerHTML = '<div><div class="kl">Næste handelsdag</div><div class="kv">–</div><div class="ks">Laves, når dagens lys er endeligt (Yahoo-volumen) – typisk næste morgen</div></div><div></div><div></div><div></div>'; return; }
    var q = n.q, ch = (q[4] - n.last_close) / n.last_close * 100, d = pd(n.d);
    box.innerHTML =
      '<div><div class="kl">Forecast · ' + cap(longD(d)) + '</div><div class="kv">' + num(q[4], 0) + '</div><div class="ks">P50 (median) · close</div></div>' +
      '<div><div class="kl">Vs. seneste close</div><div class="kv ' + tone(ch) + '">' + pct(ch, 2, true) + '</div><div class="ks">' + num(n.last_close, 0) + ' (' + shortD(pd(n.based_on)) + ')</div></div>' +
      '<div><div class="kl">P10–P90-bånd</div><div class="kv">' + num(q[0], 0) + '–' + num(q[8], 0) + '</div><div class="ks">80 % af ' + n.paths + ' stier</div></div>' +
      '<div><div class="kl">Bredde</div><div class="kv">' + pct((q[8] - q[0]) / n.last_close * 100, 1) + '</div><div class="ks">' + num(q[8] - q[0], 0) + ' point</div></div>';
  }

  // ---------- graf ----------
  function drawChart(box, days, nxt) {
    var w = Math.max(box.clientWidth, 240), h = box.clientHeight || 300;
    var pts = days.map(function (r) { return {d: pd(r.d), r: r}; });
    if (nxt) pts.push({d: pd(nxt.d), r: {d: nxt.d, q: nxt.q, prev: nxt.last_close, c: null}, fut: true});
    if (!pts.length) { box.innerHTML = '<div class="muted empty">Ingen Kronos-forecasts for denne måned</div>'; return; }
    var vals = []; pts.forEach(function (p) { vals.push(p.r.q[0], p.r.q[8]); if (p.r.c !== null) vals.push(p.r.c); });
    var rg = niceRange(Math.min.apply(null, vals), Math.max.apply(null, vals));
    var L = 58, Rm = 10, T = 10, B = 26, pw = w - L - Rm, ph = h - T - B, n = pts.length;
    var y = function (v) { return T + (rg.hi - v) / (rg.hi - rg.lo) * ph; };
    var x = function (i) { return n === 1 ? L + pw / 2 : L + 10 + i * (pw - 20) / (n - 1); };
    var s = "", i, k, v, yy;
    for (i = 0, k = Math.round((rg.hi - rg.lo) / rg.step); i <= k; i++) {
      v = rg.hi - rg.step * i; yy = y(v);
      s += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="#1F2833"/>' +
           '<text x="' + (L - 10) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" class="ax">' + num(v, 0) + '</text>';
    }
    function band(a, b) {
      var top = pts.map(function (p, j) { return x(j).toFixed(1) + "," + y(p.r.q[b]).toFixed(1); });
      var bot = pts.map(function (p, j) { return x(j).toFixed(1) + "," + y(p.r.q[a]).toFixed(1); }).reverse();
      if (n === 1) { var c = x(0); top = [(c - 8) + "," + y(pts[0].r.q[b]), (c + 8) + "," + y(pts[0].r.q[b])]; bot = [(c + 8) + "," + y(pts[0].r.q[a]), (c - 8) + "," + y(pts[0].r.q[a])]; }
      return top.concat(bot).join(" ");
    }
    s += '<polygon points="' + band(0, 8) + '" fill="rgba(34,197,94,.10)" stroke="rgba(34,197,94,.28)" stroke-width="1"/>' +
         '<polygon points="' + band(2, 6) + '" fill="rgba(34,197,94,.12)"/>';
    s += '<polyline points="' + pts.map(function (p, j) { return x(j).toFixed(1) + "," + y(p.r.q[4]).toFixed(1); }).join(" ") + '" fill="none" stroke="' + GL + '" stroke-width="1.8" stroke-dasharray="5 4" stroke-linejoin="round"/>';
    var act = pts.filter(function (p) { return p.r.c !== null; });
    if (act.length) s += '<polyline points="' + pts.map(function (p, j) { return p.r.c === null ? null : x(j).toFixed(1) + "," + y(p.r.c).toFixed(1); }).filter(Boolean).join(" ") + '" fill="none" stroke="#E6EAF0" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach(function (p, j) {
      if (p.r.c === null) { s += '<circle cx="' + x(j).toFixed(1) + '" cy="' + y(p.r.q[4]).toFixed(1) + '" r="4" fill="#111821" stroke="' + GL + '" stroke-width="2"/>'; return; }
      var dd = dir(p.r.q[4], p.r.prev, p.r.c);
      s += '<circle cx="' + x(j).toFixed(1) + '" cy="' + y(p.r.c).toFixed(1) + '" r="3.6" fill="' + (dd > 0 ? G : dd < 0 ? R : "#8B95A5") + '" stroke="#111821" stroke-width="1.5"/>';
    });
    var lab = n <= 2 ? pts.map(function (p, j) { return j; }) : [0, Math.floor((n - 1) / 2), n - 1];
    lab.forEach(function (j, q) { s += '<text x="' + x(j).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="' + (n === 1 ? "middle" : q === 0 ? "start" : j === n - 1 ? "end" : "middle") + '" class="ax">' + shortD(pts[j].d) + (pts[j].fut ? " (forecast)" : "") + '</text>'; });
    s += '<line class="hx" x1="0" x2="0" y1="' + T + '" y2="' + (T + ph) + '" stroke="#5B6675" stroke-dasharray="3 3" visibility="hidden"/>' +
         '<rect class="hov" x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="transparent"/>';
    box.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' + s + '</svg>';
    var svg = box.firstChild, hx = svg.querySelector(".hx"), hov = svg.querySelector(".hov");
    function move(ev) {
      var r = svg.getBoundingClientRect(), mx = (ev.clientX - r.left) * (w / r.width), j = 0, best = 1e9;
      pts.forEach(function (p, q) { var dd = Math.abs(x(q) - mx); if (dd < best) { best = dd; j = q; } });
      var P = pts[j].r, px = x(j);
      hx.setAttribute("x1", px); hx.setAttribute("x2", px); hx.setAttribute("visibility", "visible");
      var html = '<b>' + cap(longD(pts[j].d)) + '</b>' + (pts[j].fut ? ' · <span class="m">forecast</span>' : '') +
        '<br>Kronos P50: <b>' + num(P.q[4], 0) + '</b> <span class="m">(' + pct((P.q[4] - P.prev) / P.prev * 100, 2, true) + ')</span>' +
        '<br><span class="m">P10–P90: ' + num(P.q[0], 0) + '–' + num(P.q[8], 0) + '</span>';
      if (P.c !== null) {
        var dd = dir(P.q[4], P.prev, P.c), inb = P.c >= P.q[0] && P.c <= P.q[8];
        html += '<br>Faktisk close: <b>' + num(P.c, 0) + '</b> <span class="m">(' + pct((P.c - P.prev) / P.prev * 100, 2, true) + ')</span>' +
          '<br>Fejl: ' + pct((P.q[4] - P.c) / P.c * 100, 2, true) + ' · Retning: <span class="' + (dd > 0 ? "pos" : dd < 0 ? "neg" : "") + '">' + (dd > 0 ? "ramt" : dd < 0 ? "forkert" : "uændret") + '</span>' +
          '<br><span class="m">' + (inb ? "Inden for P10–P90" : "Uden for P10–P90") + ' · forrige close ' + num(P.prev, 0) + '</span>';
      } else html += '<br><span class="m">Forrige close ' + num(P.prev, 0) + ' · udfald ukendt endnu</span>';
      showTip(html, ev.clientX, ev.clientY);
    }
    function leave() { hx.setAttribute("visibility", "hidden"); hideTip(); }
    hov.addEventListener("mousemove", move); hov.addEventListener("mouseleave", leave);
    hov.addEventListener("touchstart", function (e) { move(e.touches[0]); clearTimeout(window.__kt); window.__kt = setTimeout(leave, 2500); }, {passive: true});
  }

  // ---------- 2×2 + liste ----------
  function bar(a) { return a === null ? '<div class="bar"><span class="bn"></span></div>' : '<div class="bar"><span class="bg" style="width:' + a + '%"></span><span class="br" style="width:' + (100 - a) + '%"></span></div>'; }
  function renderTiles(st) {
    var none = !st;
    var ratio = none || !st.mae_naive ? null : st.mae / st.mae_naive;
    var t = [
      [none ? "–" : pct(st.hit_pct), "Retning ramt", bar(none ? null : st.hit_pct) + '<div class="sub">' + (none ? "Ingen dage" : st.hit + " af " + st.n + " dage · 50 % = møntkast") + '</div>', none ? "" : st.hit_pct > 50 ? "pos" : st.hit_pct < 50 ? "neg" : ""],
      [none ? "–" : pct(st.mape, 2), "Gns. fejl (MAPE)", '<div class="sub">' + (none ? "–" : "≈ " + num(st.mae, 0) + " point pr. dag (P50 vs. close)") + '</div>', ""],
      [none ? "–" : pct(st.cov, 0), "Inden for P10–P90", bar(none ? null : st.cov) + '<div class="sub">Mål ≈ 80 % hvis båndet er kalibreret</div>', ""],
      [ratio === null ? "–" : ratio.toFixed(2).replace(".", ",") + "×", "Fejl vs. naiv", '<div class="sub">' + (ratio === null ? "–" : "Naiv = i går close (" + num(st.mae_naive, 0) + " pt) · under 1 = Kronos bedre") + '</div>', ratio === null ? "" : ratio < 1 ? "pos" : "neg"]
    ];
    $("kTiles").innerHTML = t.map(function (x) { return '<div class="panel tile"><div class="tv ' + x[3] + '">' + x[0] + '</div><div class="tl">' + x[1] + '</div>' + x[2] + '</div>'; }).join("");
  }
  function renderList(days) {
    if (!days.length) { $("kList").innerHTML = '<div class="muted empty">Ingen forecasts for denne måned</div>'; return; }
    var rows = days.slice().reverse().map(function (r) {
      var dd = dir(r.q[4], r.prev, r.c), e = (r.q[4] - r.c) / r.c * 100, inb = r.c >= r.q[0] && r.c <= r.q[8], d = pd(r.d);
      return '<tr><td>' + WDAY[d.getDay()].slice(0, 3) + ". " + shortD(d) + '</td><td>' + num(r.q[4], 0) + '</td><td>' + num(r.c, 0) + '</td><td>' + pct(e, 2, true) +
        '</td><td class="' + (dd > 0 ? "ok" : dd < 0 ? "no" : "na") + '">' + (dd > 0 ? "✓" : dd < 0 ? "✗" : "–") + '</td><td class="hm ' + (inb ? "ok" : "no") + '">' + (inb ? "ja" : "nej") + '</td></tr>';
    }).join("");
    $("kList").innerHTML = '<table class="ktab"><thead><tr><th>Dato</th><th>P50</th><th>Faktisk</th><th>Fejl</th><th>Retning</th><th class="hm">I bånd</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderMonth() {
    var y = months[cur][0], m = months[cur][1], key = monthKey(y, m), M = D.months[key] || {days: [], stats: null};
    $("mName").textContent = cap(MONTHS[m]) + " " + y;
    $("mLabel").innerHTML = "FORECAST VS. FAKTISK · " + MONTHS[m].toUpperCase() + " " + y + ' <span class="muted">· ' + (M.days.length ? M.days.length + " handelsdage" : "ingen data") + '</span>';
    $("prevM").disabled = cur <= 0; $("nextM").disabled = cur >= months.length - 1;
    var nx = D.next && D.next.d && D.next.d.slice(0, 7) === key ? D.next : null;
    drawChart($("chartBox").querySelector(".kchart") || (function () { $("chartBox").innerHTML = '<div class="kchart"></div>'; return $("chartBox").querySelector(".kchart"); })(), M.days, nx);
    renderTiles(M.stats); renderList(M.days);
  }
  renderNext = safe("næste dag", renderNext); renderMonth = safe("måned", renderMonth);

  function init(data) {
    D = data;
    $("updated").textContent = "Opdateret " + data.updated + " (dansk tid)";
    var s = data.settings || {};
    $("kModel").textContent = "Kronos-small · ^NDX dagslys · " + (s.paths || 20) + " stier · kontekst " + (s.lookback || 400) + " dage";
    $("kMethod").textContent = (data.method || "") + " Kilde: " + (data.source || "") + ". Alle tider i dansk tid. Ikke finansiel rådgivning.";
    var keys = Object.keys(data.months || {}).sort(), now = new Date(), endKey = monthKey(now.getFullYear(), now.getMonth());
    if (data.next && data.next.d && data.next.d.slice(0, 7) > endKey) endKey = data.next.d.slice(0, 7);
    var startKey = keys.length ? keys[0] : endKey, sy = +startKey.slice(0, 4), sm = +startKey.slice(5, 7) - 1;
    while (monthKey(sy, sm) <= endKey) { months.push([sy, sm]); sm++; if (sm > 11) { sm = 0; sy++; } }
    cur = months.length - 1;
    var q = new URLSearchParams(location.search).get("maaned");
    if (q) { var f = months.findIndex(function (x) { return monthKey(x[0], x[1]) === q; }); if (f >= 0) cur = f; }
    $("prevM").onclick = function () { if (cur > 0) { cur--; renderMonth(); } };
    $("nextM").onclick = function () { if (cur < months.length - 1) { cur++; renderMonth(); } };
    renderNext(); renderMonth();
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(renderMonth, 120); });
  }

  tip = $("tip");
  window.addEventListener("scroll", function () { if (tip) tip.hidden = true; }, {passive: true});
  fetch("kronos.json?t=" + Date.now(), {cache: "no-store"})
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (data) {
      if (!data || typeof data.months !== "object") throw new Error("ugyldigt indhold");
      try { init(data); } catch (err) { console.error("Kronos: init-fejl", err); safe("init", function () { throw err; })(); }
    })
    .catch(function (e) {
      console.error("Kronos: kronos.json", e);
      document.body.insertAdjacentHTML("afterbegin", '<div class="err">Kunne ikke indlæse kronos.json (' + esc(e.message) + ')</div>');
    });
})();
