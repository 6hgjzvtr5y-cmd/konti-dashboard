/* Konti-dashboard – interaktiv version. Ingen eksterne afhængigheder. Data: data.json (fra build_data.py). */
(function () {
  "use strict";
  var MONTHS = ["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
  var MSHORT = ["jan.","feb.","mar.","apr.","maj","jun.","jul.","aug.","sep.","okt.","nov.","dec."];
  var WDAY = ["søndag","mandag","tirsdag","onsdag","torsdag","fredag","lørdag"];
  var G = "#22C55E", R = "#EF4444";
  var D, accs, view = "both", curMonth, months = [], today;

  // ---------- format ----------
  function num(x, dec) {
    var s = Math.abs(x).toFixed(dec), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return dec ? i + "," + p[1] : i;
  }
  function money(x, dec, sign) {
    if (dec === undefined) dec = 2;
    var pre = sign ? (x > 1e-9 ? "+" : x < -1e-9 ? "−" : "") : (x < -1e-9 ? "−" : "");
    return pre + "$" + num(x, dec);
  }
  function pct(x, sign) {
    var pre = sign ? (x > 1e-9 ? "+" : x < -1e-9 ? "−" : "") : "";
    return pre + Math.abs(x).toFixed(2).replace(".", ",") + " %";
  }
  function tone(v) { return v > 1e-9 ? "pos" : v < -1e-9 ? "neg" : "flat"; }
  function arrow(v) { return {pos: "▲", neg: "▼", flat: "●"}[tone(v)]; }
  function pd(s) { var a = s.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function shortD(d) { return d.getDate() + ". " + MSHORT[d.getMonth()]; }
  function longD(d) { return WDAY[d.getDay()] + " " + d.getDate() + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }); }
  function $(id) {
    var e = document.getElementById(id);
    if (!e) { console.warn("Konti-dashboard: element #" + id + " mangler (blandet cache-version?)"); e = document.createElement("div"); }
    return e;
  }
  // render-fejl må aldrig vælte hele siden: log + lille note nederst
  function safe(name, fn) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (err) {
        console.error("Konti-dashboard: fejl i " + name, err);
        if (!document.getElementById("renderNote")) {
          var n = document.createElement("div"); n.id = "renderNote"; n.className = "rnote";
          n.textContent = "En del af siden kunne ikke vises. Genindlæs siden.";
          document.body.appendChild(n);
        }
      }
    };
  }

  // ---------- data ----------
  function derive(a) {
    var start = +a.start, eq = {}, k;
    for (k in a.equity) eq[k] = +a.equity[k];
    var dates = Object.keys(eq).sort(), cur = dates.length ? eq[dates[dates.length - 1]] : start;
    var peak = start, mdd = 0;
    dates.forEach(function (k) { peak = Math.max(peak, eq[k]); mdd = Math.min(mdd, (eq[k] - peak) / peak * 100); });
    var mx = start; dates.forEach(function (k) { mx = Math.max(mx, eq[k]); });
    return {name: a.name, start: start, eq: eq, dates: dates, cur: cur, pnl: cur - start, pnlPct: (cur - start) / start * 100, peak: mx, mdd: mdd};
  }
  function daily(a, k) {
    if (!(k in a.eq)) return null;
    var i = a.dates.indexOf(k), base = i > 0 ? a.eq[a.dates[i - 1]] : a.start;
    return a.eq[k] - base;
  }

  // ---------- tooltip ----------
  var tip;
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight, vw = window.innerWidth;
    var lx = x + 14; if (lx + w > vw - 6) lx = x - w - 14; if (lx < 6) lx = 6;
    var ly = y - h - 12; if (ly < 6) ly = y + 16;
    tip.style.left = lx + "px"; tip.style.top = ly + "px";
  }
  function hideTip() { tip.hidden = true; }

  // ---------- chart ----------
  function niceRange(lo, hi, start) {
    if (hi - lo < start * 0.002) { var p = start * 0.01; return {lo: start - p, hi: start + p, step: p / 2}; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var raw = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).filter(function (s) { return s >= raw; })[0];
    return {lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step: step};
  }
  function drawChart(box, a, idx) {
    var w = Math.max(box.clientWidth, 200), h = box.clientHeight || 230;
    var pts = a.dates.map(function (k) { return {d: pd(k), k: k, v: a.eq[k]}; });
    if (!pts.length) { box.innerHTML = '<div class="muted" style="padding:80px 0;text-align:center">Ingen data endnu</div>'; return; }
    var vals = pts.map(function (p) { return p.v; }).concat([a.start]);
    var rg = niceRange(Math.min.apply(null, vals), Math.max.apply(null, vals), a.start);
    var L = 62, Rm = 8, T = 10, B = 26, pw = w - L - Rm, ph = h - T - B;
    var y = function (v) { return T + (rg.hi - v) / (rg.hi - rg.lo) * ph; };
    var col = pts[pts.length - 1].v < a.start ? R : G, xy;
    if (pts.length === 1) xy = [[L, y(pts[0].v)], [L + pw, y(pts[0].v)]];
    else {
      var d0 = pts[0].d, span = Math.max((pts[pts.length - 1].d - d0) / 864e5, 1);
      xy = pts.map(function (p) { return [L + (p.d - d0) / 864e5 / span * pw, y(p.v)]; });
    }
    var line = xy.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
    var area = xy[0][0].toFixed(1) + "," + (T + ph) + " " + line + " " + xy[xy.length - 1][0].toFixed(1) + "," + (T + ph);
    var s = "", n = Math.round((rg.hi - rg.lo) / rg.step), i, v, yy, dec = rg.step >= 1 ? 0 : 2;
    for (i = 0; i <= n; i++) {
      v = rg.hi - rg.step * i; yy = y(v);
      s += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="#1F2833"/>' +
           '<text x="' + (L - 10) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" class="ax">' + money(v, dec) + '</text>';
    }
    var sy = y(a.start), gid = "grad" + idx;
    s = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + col + '" stop-opacity=".35"/><stop offset="100%" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' + s +
      '<polygon points="' + area + '" fill="url(#' + gid + ')"/>' +
      '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + sy.toFixed(1) + '" y2="' + sy.toFixed(1) + '" stroke="#5B6675" stroke-dasharray="4 4"/>' +
      '<text x="' + (L + pw - 4) + '" y="' + (sy - 6).toFixed(1) + '" text-anchor="end" class="ax">Start</text>' +
      '<polyline points="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>';
    // x-labels
    var xl = pts.length === 1 ? [[L, shortD(pts[0].d), "start"], [L + pw, shortD(pts[0].d), "end"]]
      : [0, Math.floor(pts.length / 2), pts.length - 1].filter(function (v, i, arr) { return arr.indexOf(v) === i; })
          .map(function (j, q, arr) { return [xy[j][0], shortD(pts[j].d), j === 0 ? "start" : j === pts.length - 1 ? "end" : "middle"]; });
    xl.forEach(function (t) { s += '<text x="' + t[0].toFixed(1) + '" y="' + (h - 6) + '" text-anchor="' + t[2] + '" class="ax">' + t[1] + '</text>'; });
    var last = xy[xy.length - 1];
    s += '<line class="hx" x1="0" x2="0" y1="' + T + '" y2="' + (T + ph) + '" stroke="#5B6675" stroke-dasharray="3 3" visibility="hidden"/>' +
         '<circle class="hp" r="5" fill="' + col + '" stroke="#111821" stroke-width="2" visibility="hidden"/>' +
         '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4.5" fill="' + col + '" stroke="#111821" stroke-width="2"/>' +
         '<rect class="hov" x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="transparent"/>';
    box.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' + s + '</svg>';
    var svg = box.firstChild, hx = svg.querySelector(".hx"), hp = svg.querySelector(".hp"), hov = svg.querySelector(".hov");
    var ptsX = pts.length === 1 ? null : xy;
    function move(ev) {
      var r = svg.getBoundingClientRect(), mx = (ev.clientX - r.left) * (w / r.width), j = 0;
      if (ptsX) { var best = 1e9; ptsX.forEach(function (p, q) { var dd = Math.abs(p[0] - mx); if (dd < best) { best = dd; j = q; } }); }
      var P = pts[j], px = ptsX ? ptsX[j][0] : Math.min(Math.max(mx, L), L + pw), py = ptsX ? ptsX[j][1] : xy[0][1];
      hx.setAttribute("x1", px); hx.setAttribute("x2", px); hx.setAttribute("visibility", "visible");
      hp.setAttribute("cx", px); hp.setAttribute("cy", py); hp.setAttribute("visibility", "visible");
      var dp = daily(a, P.k), tot = P.v - a.start;
      showTip('<b>' + esc(a.name) + '</b> · <span class="m">' + longD(P.d) + '</span><br>Equity: <b>' + money(P.v) + '</b><br>' +
        'Siden start: <span class="' + tone(tot) + '">' + money(tot, 2, true) + ' (' + pct(tot / a.start * 100, true) + ')</span><br>' +
        'Dagens P&amp;L: <span class="' + tone(dp) + '">' + money(dp, 2, true) + '</span>', ev.clientX, ev.clientY);
    }
    function leave() { hx.setAttribute("visibility", "hidden"); hp.setAttribute("visibility", "hidden"); hideTip(); }
    hov.addEventListener("mousemove", move); hov.addEventListener("mouseleave", leave);
    hov.addEventListener("touchstart", function (e) { move(e.touches[0]); clearTimeout(window.__kt); window.__kt = setTimeout(leave, 2500); }, {passive: true});
  }

  // ---------- account panels ----------
  function renderAccounts() {
    var row = $("acctRow"), list = view === "both" ? [0, 1] : [+view];
    row.className = "row" + (list.length === 1 ? " single" : "");
    row.innerHTML = list.map(function (i) {
      var a = accs[i], t = tone(a.pnl);
      return '<div class="panel acct"><div class="phead"><div class="pname"><span class="dot ' + t + '"></span>' + esc(a.name) +
        '<span class="badge">PAPER</span></div><div class="muted">Start ' + money(a.start) + '</div></div>' +
        '<div class="big">' + money(a.cur) + '</div><div class="rowsb"><div class="muted">Balance</div>' +
        '<div class="pill ' + t + '">' + arrow(a.pnl) + ' ' + money(a.pnl, 2, true) + ' · ' + pct(a.pnlPct, true) + '</div></div>' +
        '<div class="chart" data-i="' + i + '"></div><div class="mini">' +
        '<div><div class="mv">' + money(a.peak) + '</div><div class="ml">Højeste equity</div></div>' +
        '<div><div class="mv ' + (a.mdd < 0 ? "neg" : "") + '">' + (a.mdd < 0 ? pct(a.mdd, true) : "0,00 %") + '</div><div class="ml">Max drawdown</div></div>' +
        '<div><div class="mv">' + a.dates.length + '</div><div class="ml">Dage registreret</div></div></div></div>';
    }).join("");
    row.querySelectorAll(".chart").forEach(function (b) { drawChart(b, accs[+b.dataset.i], +b.dataset.i); });
  }

  // ---------- tiles ----------
  // ---------- handelsstatistik (2×2 pr. konto) ----------
  var STAT_META = [
    {label: "TRADINGVIEW · HANDELSSTATISTIK", key: "tv_stats", netLabel: "Netto P&amp;L", nosrc: "Ingen datakilde endnu", src: "(fra TradingView-journal)"},
    {label: "NB v1.1 · LIQUID · HANDELSSTATISTIK", key: "nb_stats", netLabel: "Netto P&amp;L (NB)", nosrc: "Ingen datakilde endnu", src: "(fra NB v1.1 Journal)"}
  ];
  function statBlock(i) {
    var meta = STAT_META[i], raw = D[meta.key], has = raw !== null && raw !== undefined, s = raw || {};
    var n = +(s.trades || 0), w = +(s.wins || 0), l = +(s.losses || 0);
    var wr = n ? w / n * 100 : null, aw = s.avg_win, al = s.avg_loss, net = +(s.net || 0);
    var ratio = (aw && al) ? Math.abs(aw) / Math.abs(al) : null;
    var bar = function (a, b) { return a === null ? '<div class="bar"><span class="bn"></span></div>' :
      '<div class="bar"><span class="bg" style="width:' + a + '%"></span><span class="br" style="width:' + b + '%"></span></div>'; };
    var tiles = [
      [String(n), "Handler", '<div class="sub">' + w + ' vundet · ' + l + ' tabt</div>', ""],
      [wr === null ? "–" : pct(wr), "Winrate", bar(wr, wr === null ? 0 : 100 - wr), ""],
      [ratio === null ? "–" : ratio.toFixed(2).replace(".", ","), "Gns. gevinst / Gns. tab",
        (ratio === null ? bar(null) : bar(Math.abs(aw) / (Math.abs(aw) + Math.abs(al)) * 100, Math.abs(al) / (Math.abs(aw) + Math.abs(al)) * 100)) +
        '<div class="sub">' + (ratio === null ? "– / –" : money(Math.abs(aw)) + " / " + money(-Math.abs(al))) + '</div>', ""],
      [money(net, 2, true), meta.netLabel, '<div class="sub">Sum af lukkede handler</div>', tone(net) === "flat" ? "" : tone(net)]
    ];
    return '<div class="statcol"><div class="seclabel">' + meta.label + ' <span class="muted">' + (has ? meta.src : meta.nosrc) + '</span></div>' +
      '<div class="tiles2">' + tiles.map(function (t) {
        return '<div class="panel tile"><div class="tv ' + t[3] + '">' + t[0] + '</div><div class="tl">' + t[1] + '</div>' + t[2] + '</div>';
      }).join("") + '</div></div>';
  }
  function renderTiles() {
    var list = view === "both" ? [0, 1] : [+view], row = $("statRow");
    row.className = "row statrow" + (list.length === 1 ? " single" : "");
    row.innerHTML = list.map(statBlock).join("");
  }

  // ---------- calendar ----------
  function cellStyle(v, start) {
    if (v === null) return ["nodata", ""];
    var p = v / start * 100, x = Math.abs(p);
    if (x < 1e-9) return ["zero", ""];
    var lvl = x <= .25 ? 1 : x <= .5 ? 2 : x <= 1 ? 3 : x <= 2 ? 4 : 5, al = [0, .10, .16, .24, .34, .46][lvl];
    return [p > 0 ? "up" : "dn", 'style="background:rgba(' + (p > 0 ? "34,197,94" : "239,68,68") + ',' + al + ')"'];
  }
  function calendar(a, y, m) {
    var first = new Date(y, m, 1), nxt = new Date(y, m + 1, 1);
    var mon = new Date(y, m, 1 - ((first.getDay() + 6) % 7)), weeks = [];
    while (mon < nxt) {
      var has = false; for (var i = 0; i < 5; i++) { if (new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i).getMonth() === m) has = true; }
      if (has) weeks.push(new Date(mon)); mon.setDate(mon.getDate() + 7);
    }
    var t0 = a.dates.length ? pd(a.dates[0]) : null, rows = "", mtot = 0, mdays = 0;
    weeks.forEach(function (wk) {
      var wsum = 0, wn = 0, c = "";
      for (var i = 0; i < 5; i++) {
        var day = new Date(wk.getFullYear(), wk.getMonth(), wk.getDate() + i), k = iso(day);
        if (day.getMonth() !== m) { c += '<div class="cell out"></div>'; continue; }
        if (day > today) { c += '<div class="cell fut" data-tip="' + esc('<b>' + longD(day) + '</b><br><span class="m">Fremtidig dag</span>') + '"><span class="d">' + day.getDate() + '</span></div>'; continue; }
        var v = daily(a, k);
        if (v === null) {
          var pre = !t0 || day < t0;
          c += '<div class="cell ' + (pre ? "pre" : "nodata") + '" data-tip="' + esc('<b>' + longD(day) + '</b><br><span class="m">' + (pre ? "Før sporing startede" : "Ingen registrering") + '</span>') + '"><span class="d">' + day.getDate() + '</span></div>';
          continue;
        }
        var cs = cellStyle(v, a.start), p = v / a.start * 100;
        wsum += v; wn++; mtot += v; mdays++;
        var tipH = '<b>' + longD(day) + '</b> · <span class="m">' + esc(a.name) + '</span><br>Dagens P&amp;L: <span class="' + tone(v) + '">' + money(v, 2, true) + ' (' + pct(p, true) + ')</span><br>Equity ved luk: <b>' + money(a.eq[k]) + '</b><br><span class="m">Siden start: ' + money(a.eq[k] - a.start, 2, true) + '</span>';
        c += '<div class="cell ' + cs[0] + '" ' + cs[1] + ' data-tip="' + esc(tipH) + '"><span class="d">' + day.getDate() + '</span><div class="cv">' + money(v, Math.abs(v) >= 1000 ? 0 : 2, true).replace("$", "") + '</div><div class="cp">' + pct(p, true) + '</div></div>';
      }
      if (wn) {
        var wt = '<b>Uge ' + isoWeek(wk) + '</b> · <span class="m">' + esc(a.name) + '</span><br>Uge-P&amp;L: <span class="' + tone(wsum) + '">' + money(wsum, 2, true) + ' (' + pct(wsum / a.start * 100, true) + ')</span><br><span class="m">' + wn + ' handelsdag' + (wn > 1 ? "e" : "") + ' registreret</span>';
        c += '<div class="cell tot ' + tone(wsum) + '" data-tip="' + esc(wt) + '"><div class="cv">' + money(wsum, Math.abs(wsum) >= 1000 ? 0 : 2, true) + '</div><div class="cp">' + pct(wsum / a.start * 100, true) + '</div></div>';
      } else c += '<div class="cell tot"><div class="cv dim">–</div></div>';
      rows += c;
    });
    for (var e = weeks.length; e < 5; e++) rows += '<div class="cell out"></div>'.repeat(5) + '<div class="cell tot" style="opacity:.35"></div>';
    var head = ["Man", "Tir", "Ons", "Tor", "Fre", "Uge total"].map(function (x) { return '<div class="ch">' + x + '</div>'; }).join("");
    var t = tone(mtot);
    return '<div class="panel cal"><div class="phead"><div><div class="ctitle">' + cap(MONTHS[m]) + ' ' + y + '</div><div class="muted">' + esc(a.name) + ' · daglig P&amp;L</div></div>' +
      '<div class="chips"><div><div class="chv">' + mdays + '</div><div class="chl">Dage</div></div><div><div class="chv ' + (t === "flat" ? "" : t) + '">' + money(mtot, 2, true) + '</div><div class="chl">Måned</div></div>' +
      '<div><div class="chv ' + (t === "flat" ? "" : t) + '">' + pct(mtot / a.start * 100, true) + '</div><div class="chl">Procent</div></div></div></div>' +
      '<div class="grid">' + head + rows + '</div></div>';
  }
  function isoWeek(d) { var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function renderCal() {
    var y = curMonth[0], m = curMonth[1], list = view === "both" ? [0, 1] : [+view];
    $("calLabel").textContent = "MÅNEDSKALENDER · " + MONTHS[m].toUpperCase() + " " + y;
    $("mName").textContent = cap(MONTHS[m]) + " " + y;
    var idx = months.findIndex(function (x) { return x[0] === y && x[1] === m; });
    $("prevM").disabled = idx <= 0; $("nextM").disabled = idx >= months.length - 1;
    var row = $("calRow"); row.className = "row" + (list.length === 1 ? " single" : "");
    row.innerHTML = list.map(function (i) { return calendar(accs[i], y, m); }).join("");
  }

  renderAccounts = safe("konto-paneler", renderAccounts);
  renderTiles = safe("handelsstatistik", renderTiles);
  renderCal = safe("kalender", renderCal);
  function renderAll() { renderAccounts(); renderTiles(); renderCal(); }

  function init(data) {
    D = data; accs = data.accounts.map(derive); today = pd(data.today);
    $("updated").textContent = "Opdateret " + data.updated + " (dansk tid)";
    // måneder: fra første registrering til i dag
    var all = []; accs.forEach(function (a) { all = all.concat(a.dates); }); all.sort();
    var s = all.length ? pd(all[0]) : today, cy = s.getFullYear(), cm = s.getMonth();
    while (cy < today.getFullYear() || (cy === today.getFullYear() && cm <= today.getMonth())) { months.push([cy, cm]); cm++; if (cm > 11) { cm = 0; cy++; } }
    curMonth = months[months.length - 1];
    $("prevM").onclick = function () { var i = months.findIndex(function (x) { return x[0] === curMonth[0] && x[1] === curMonth[1]; }); if (i > 0) { curMonth = months[i - 1]; renderCal(); } };
    $("nextM").onclick = function () { var i = months.findIndex(function (x) { return x[0] === curMonth[0] && x[1] === curMonth[1]; }); if (i < months.length - 1) { curMonth = months[i + 1]; renderCal(); } };
    $("acctToggle").querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { view = b.dataset.v; $("acctToggle").querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); renderAccounts(); renderTiles(); renderCal(); };
    });
    document.addEventListener("mouseover", function (e) { var c = e.target.closest && e.target.closest("[data-tip]"); if (!c) return; c.onmousemove = function (ev) { showTip(c.dataset.tip, ev.clientX, ev.clientY); }; c.onmouseleave = hideTip; });
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(renderAccounts, 120); });
    // valgfri start-parametre: ?konto=0|1|both&maaned=YYYY-MM
    var q = new URLSearchParams(location.search);
    if (q.get("konto")) { var b = $("acctToggle").querySelector('[data-v="' + q.get("konto") + '"]'); if (b) b.click(); }
    if (q.get("maaned")) { var mm = q.get("maaned").split("-"), f = months.find(function (x) { return x[0] === +mm[0] && x[1] === +mm[1] - 1; }); if (f) curMonth = f; }
    renderAll();
  }

  tip = $("tip");
  window.addEventListener("scroll", function () { if (tip) tip.hidden = true; }, {passive: true});
  fetch("data.json?t=" + Date.now(), {cache: "no-store"})
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (data) {
      if (!data || !Array.isArray(data.accounts)) throw new Error("ugyldigt indhold");
      return data;
    }, function (e) { throw e; })
    .then(function (data) {
      try { init(data); }
      catch (err) { console.error("Konti-dashboard: init-fejl", err); safe("init", function () { throw err; })(); }
    })
    .catch(function (e) {
      console.error("Konti-dashboard: data.json", e);
      document.body.insertAdjacentHTML("afterbegin", '<div class="err">Kunne ikke indlæse data.json (' + esc(e.message) + ')</div>');
    });
})();
