/* Konti-dashboard – interaktiv version. Ingen eksterne afhængigheder. Data: data.json (fra build_data.py). */
(function () {
  "use strict";
  var MONTHS = ["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
  var MSHORT = ["jan.","feb.","mar.","apr.","maj","jun.","jul.","aug.","sep.","okt.","nov.","dec."];
  var WDAY = ["søndag","mandag","tirsdag","onsdag","torsdag","fredag","lørdag"];
  var G = "#22C55E", R = "#EF4444";
  var D, accs, accsLiq, accsMnq, view = "both", curMonth, months = [], today;
  var fee = "liquid", LIQ = -1, FEE_KEY = "konti.gebyr";

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
    return {name: a.name, label: a.label || a.name, start: start, eq: eq, dates: dates, cur: cur, pnl: cur - start, pnlPct: (cur - start) / start * 100, peak: mx, mdd: mdd};
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
    var fd = idx === LIQ ? fDiffs(a) : null;   // F-skygge (kun Liquid): equity + kumuleret (F − A)
    if (fd) pts.forEach(function (p) { p.f = p.v + fd[p.k]; });
    var vals = pts.map(function (p) { return p.v; }).concat([a.start]).concat(fd ? pts.map(function (p) { return p.f; }) : []);
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
    if (fd) {
      var fxy = pts.length === 1 ? [[L, y(pts[0].f)], [L + pw, y(pts[0].f)]] : pts.map(function (p, q) { return [xy[q][0], y(p.f)]; });
      s += '<polyline points="' + fxy.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '" fill="none" stroke="#C9D3DF" stroke-opacity=".85" stroke-width="1.8" stroke-dasharray="6 4" stroke-linejoin="round"/>' +
        '<circle cx="' + fxy[fxy.length - 1][0].toFixed(1) + '" cy="' + fxy[fxy.length - 1][1].toFixed(1) + '" r="3.5" fill="#C9D3DF" stroke="#111821" stroke-width="1.5"/>' +
        '<g class="flg" transform="translate(' + (L + 8) + ',' + (T + 12) + ')"><line x1="0" x2="16" y1="-4" y2="-4" stroke="' + col + '" stroke-width="2.4"/><text x="21" y="0" class="ax">A (faktisk)</text>' +
        '<line x1="92" x2="108" y1="-4" y2="-4" stroke="#C9D3DF" stroke-width="1.8" stroke-dasharray="5 3"/><text x="113" y="0" class="ax">F (skygge)</text></g>';
    }
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
      showTip('<b>' + esc(a.label) + '</b> · <span class="m">' + longD(P.d) + '</span><br>Equity: <b>' + money(P.v) + '</b><br>' +
        'Siden start: <span class="' + tone(tot) + '">' + money(tot, 2, true) + ' (' + pct(tot / a.start * 100, true) + ')</span><br>' +
        'Dagens P&amp;L: <span class="' + tone(dp) + '">' + money(dp, 2, true) + '</span>' +
        (fd ? '<br>F (skygge): <b>' + money(P.f) + '</b> · <span class="' + tone(P.f - P.v) + '">' + money(P.f - P.v, 2, true) + ' vs. A</span>' : ''), ev.clientX, ev.clientY);
    }
    function leave() { hx.setAttribute("visibility", "hidden"); hp.setAttribute("visibility", "hidden"); hideTip(); }
    hov.addEventListener("mousemove", move); hov.addEventListener("mouseleave", leave);
    hov.addEventListener("touchstart", function (e) { move(e.touches[0]); clearTimeout(window.__kt); window.__kt = setTimeout(leave, 2500); }, {passive: true});
  }

  // ---------- gebyr-knap (kun Liquid) ----------
  function bpTxt(x) { return String(+x).replace(".", ",") + " bp"; }
  function mnqOk() { return !!(D && D.nb_stats_mnq && D.liquid_fee_adj && D.mnq); }
  function feeNote() {
    var m = D.mnq || {};
    return '<b>MNQ-gebyrer (simuleret)</b><br>Hver handel = brutto-P&amp;L − ' + bpTxt(m.bp) + ' af handlens værdi pr. round trip.<br>' +
      '<span class="m">IBKR MNQ: kommission $0,25 + CME $0,35 + NFA $0,02 pr. side<br>+ ca. 1 tick slippage ≈ ' + bpTxt(m.est_bp) + ' – ' + bpTxt(m.bp) + ' er sat konservativt.<br>' +
      'Liquid-gebyrer = faktiske Liquid-tal (≈ 19 bp pr. round trip).</span>';
  }
  function feeSeg() {
    var ok = mnqOk();
    return '<div class="seg feeseg" role="group" aria-label="Gebyrer"' + (ok ? ' data-tip="' + esc(feeNote()) + '"' : '') + '>' +
      '<button data-f="liquid" class="' + (fee === "liquid" ? "on" : "") + '">Liquid-gebyrer</button>' +
      '<button data-f="mnq" class="' + (fee === "mnq" ? "on" : "") + '"' + (ok ? '' : ' disabled title="MNQ-data mangler (journal uden brutto/gebyr)"') + '>MNQ-gebyrer</button></div>';
  }
  function setFee(f, store) {
    if (f !== "mnq" || !mnqOk()) f = "liquid";
    fee = f; accs = f === "mnq" ? accsMnq : accsLiq;
    if (store) { try { localStorage.setItem(FEE_KEY, f); } catch (e) { /* Safari privat / iframe uden storage */ } }
    var n = document.getElementById("feeLegend");
    if (n) { n.hidden = f !== "mnq" || view === "0"; n.innerHTML = f === "mnq" ? 'MNQ-gebyrer (Liquid-boksen): simuleret – brutto-P&amp;L fra NB-journalen minus ' + bpTxt(D.mnq.bp) + ' af handlens værdi pr. round trip (IBKR MNQ ≈ ' + bpTxt(D.mnq.est_bp) + ' inkl. kommission, CME/NFA-gebyrer og ~1 tick slippage; 1 bp er konservativt). Ikke faktiske Liquid-tal.' : ''; }
  }
  function bindFeeSeg(root) {
    var sg = root.querySelector(".feeseg"); if (!sg) return;
    sg.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { if (b.disabled || b.dataset.f === fee) return; setFee(b.dataset.f, true); renderAll(); };
    });
    sg.addEventListener("touchstart", function (e) {
      if (!sg.dataset.tip) return; var t = e.touches[0]; showTip(sg.dataset.tip, t.clientX, t.clientY);
      clearTimeout(window.__kt); window.__kt = setTimeout(hideTip, 3500);
    }, {passive: true});
  }
  function mnqAccount(a) {
    // Liquid-equity + kumuleret (Liquid-gebyr − MNQ-gebyr) til og med hver dag
    var adj = D.liquid_fee_adj || {}, days = Object.keys(adj).sort(), eq = {}, k;
    for (k in a.equity) {
      var c = 0; days.forEach(function (d) { if (d <= k) c += +adj[d]; });
      eq[k] = +a.equity[k] + c;
    }
    return {name: a.name, label: a.name + " (MNQ-gebyrer, simuleret)", start: a.start, equity: eq};
  }

  // ---------- account panels ----------
  function renderAccounts() {
    var row = $("acctRow"), list = view === "both" ? [0, 1] : [+view];
    row.className = "row" + (list.length === 1 ? " single" : "");
    row.innerHTML = list.map(function (i) {
      var a = accs[i], t = tone(a.pnl), sim = i === LIQ && fee === "mnq";
      return '<div class="panel acct"><div class="phead"><div class="pname"><span class="dot ' + t + '"></span>' + esc(a.name) +
        '<span class="badge">PAPER</span></div>' + (i === LIQ ? feeSeg() : '') + '</div>' +
        '<div class="big">' + money(a.cur) + '</div><div class="rowsb"><div class="muted">' + (sim ? 'Simuleret' : 'Balance') +
        ' · start ' + money(a.start, 0) + '</div>' +
        '<div class="pill ' + t + '">' + arrow(a.pnl) + ' ' + money(a.pnl, 2, true) + ' · ' + pct(a.pnlPct, true) + '</div></div>' +
        '<div class="chart" data-i="' + i + '"></div><div class="mini">' +
        '<div><div class="mv">' + money(a.peak) + '</div><div class="ml">Højeste equity</div></div>' +
        '<div><div class="mv ' + (a.mdd < 0 ? "neg" : "") + '">' + (a.mdd < 0 ? pct(a.mdd, true) : "0,00 %") + '</div><div class="ml">Max drawdown</div></div>' +
        '<div><div class="mv">' + a.dates.length + '</div><div class="ml">Dage registreret</div></div></div></div>';
    }).join("");
    bindFeeSeg(row);
    row.querySelectorAll(".chart").forEach(function (b) { drawChart(b, accs[+b.dataset.i], +b.dataset.i); });
  }

  // ---------- tiles ----------
  // ---------- handelsstatistik (2×2 pr. konto) ----------
  var STAT_META = [
    {label: "TRADINGVIEW · HANDELSSTATISTIK", key: "tv_stats", netLabel: "Netto P&amp;L", nosrc: "Ingen datakilde endnu", src: "(fra TradingView-journal)"},
    {label: "NB v1.1 · LIQUID · HANDELSSTATISTIK", key: "nb_stats", netLabel: "Netto P&amp;L (NB)", nosrc: "Ingen datakilde endnu", src: "(fra NB v1.1 Journal)"},
    {label: "NB v1.1 · LIQUID · HANDELSSTATISTIK", key: "nb_stats_mnq", netLabel: "Netto P&amp;L (NB, MNQ)", nosrc: "Ingen datakilde endnu", src: "(simuleret med MNQ-gebyrer)"}
  ];
  function statBlock(i) {
    var meta = STAT_META[i === 1 && fee === "mnq" ? 2 : i], raw = D[meta.key], has = raw !== null && raw !== undefined, s = raw || {};
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
      [money(net, 2, true), meta.netLabel, '<div class="sub">' + (s.gross !== undefined && s.fees !== undefined ? 'Brutto ' + money(+s.gross, 2, true) + ' · gebyr ' + money(-Math.abs(+s.fees), 2, true) : 'Sum af lukkede handler') + '</div>', tone(net) === "flat" ? "" : tone(net)]
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
        var tipH = '<b>' + longD(day) + '</b> · <span class="m">' + esc(a.label) + '</span><br>Dagens P&amp;L: <span class="' + tone(v) + '">' + money(v, 2, true) + ' (' + pct(p, true) + ')</span><br>Equity ved luk: <b>' + money(a.eq[k]) + '</b><br><span class="m">Siden start: ' + money(a.eq[k] - a.start, 2, true) + '</span>';
        var hx = a.name === "Liquid" && XV && XV.days && XV.days[k];
        if (hx) tipH += '<br><span class="m">Tryk: se exit-varianter</span>';
        c += '<div class="cell ' + cs[0] + (hx ? ' hasx" data-x="' + k : '') + '" ' + cs[1] + ' data-tip="' + esc(tipH) + '"><span class="d">' + day.getDate() + '</span><div class="cv">' + money(v, Math.abs(v) >= 1000 ? 0 : 2, true).replace("$", "") + '</div><div class="cp">' + pct(p, true) + '</div></div>';
      }
      if (wn) {
        var wt = '<b>Uge ' + isoWeek(wk) + '</b> · <span class="m">' + esc(a.label) + '</span><br>Uge-P&amp;L: <span class="' + tone(wsum) + '">' + money(wsum, 2, true) + ' (' + pct(wsum / a.start * 100, true) + ')</span><br><span class="m">' + wn + ' handelsdag' + (wn > 1 ? "e" : "") + ' registreret</span>';
        c += '<div class="cell tot ' + tone(wsum) + '" data-tip="' + esc(wt) + '"><div class="cv">' + money(wsum, Math.abs(wsum) >= 1000 ? 0 : 2, true) + '</div><div class="cp">' + pct(wsum / a.start * 100, true) + '</div></div>';
      } else c += '<div class="cell tot"><div class="cv dim">–</div></div>';
      rows += c;
    });
    for (var e = weeks.length; e < 5; e++) rows += '<div class="cell out"></div>'.repeat(5) + '<div class="cell tot" style="opacity:.35"></div>';
    var head = ["Man", "Tir", "Ons", "Tor", "Fre", "Uge total"].map(function (x) { return '<div class="ch">' + x + '</div>'; }).join("");
    var t = tone(mtot);
    return '<div class="panel cal"><div class="phead"><div><div class="ctitle">' + cap(MONTHS[m]) + ' ' + y + '</div><div class="muted">' + esc(a.name) + (a.label !== a.name ? ' · MNQ-gebyrer (sim.)' : ' · daglig P&amp;L') + '</div></div>' +
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


  // ---------- F-skygge (NB v1.1 variant F, f_skygge.json) ----------
  var FS = null;
  function fDays() { return FS && FS.days ? Object.keys(FS.days).sort() : []; }
  function fDiffAt(k) {   // kumuleret F − A til og med dag k for valgt gebyr-model
    var ds = fDays(), d = 0, f = fee === "mnq" ? "mnq" : "liquid";
    ds.forEach(function (x) { if (x <= k && FS.days[x].diff) d = +FS.days[x].diff[f]; });
    return d;
  }
  function fDiffs(a) {
    if (!fDays().length) return null;
    var o = {}; a.dates.forEach(function (k) { o[k] = fDiffAt(k); }); return o;
  }
  function fLine() {
    var ds = fDays(); if (!ds.length || LIQ < 0) return "";
    var a = accs[LIQ], dz = fDiffAt("9999-12-31"), fx = a.cur + dz, f = fee === "mnq" ? "mnq" : "liquid";
    var tipH = '<b>F-skygge</b> · NB v1.1 variant F (exit først efter 2 fejlede halvtimes-tjek i træk)<br>' +
      ds.map(function (k) { var r = FS.days[k]; return shortD(pd(k)) + ': F <span class="' + tone(r.f[f]) + '">' + money(r.f[f], 2, true) + '</span> · A <span class="' + tone(r.a_net[f]) + '">' + money(r.a_net[f], 2, true) + '</span>'; }).join('<br>') +
      '<br><span class="m">Samme indgange, stop og størrelse som NB. Replay – ingen rigtige ordrer. ' + (f === "mnq" ? 'MNQ-gebyrer (sim.).' : 'Liquid-gebyrer.') + '</span>';
    return '<div class="fsk" data-tip="' + esc(tipH) + '"><i></i><span>F-skygge: <b>' + money(fx) + '</b> (A: ' + money(a.cur) + '), forskel <b class="' + tone(dz) + '">' + money(dz, 2, true) + '</b>, ' + ds.length + ' dag' + (ds.length === 1 ? '' : 'e') + '</span></div>';
  }

  // ---------- exit-varianter (NB tabsdage, egen boks under Liquid-kolonnen) ----------
  var XV = null, xSel = null, XORD = "ABCDEFGHI";
  var XLAB = {A: "max(UB, VWAP)", B: "Kun VWAP", C: "Kun UB", D: "min(UB, VWAP)", E: "Kun stop + luk", F: "2 tjek i træk", G: "Hele timer", H: "Modsat grænse", I: "Spring 1. tjek"};
  function xDays() { return XV && XV.days ? Object.keys(XV.days).sort() : []; }
  function exitBox() {
    var ds = xDays(), k = xSel && XV.days[xSel] ? xSel : ds[ds.length - 1], useM = fee === "mnq";
    var head = '<div class="phead"><div><div class="ctitle">Exit-varianter</div><div class="muted">NB v1.1 · ' + (useM ? 'MNQ-gebyrer (sim.)' : 'Liquid-gebyrer') + '</div></div>';
    if (!k) return '<div class="panel cal xbox">' + head + '</div><div class="xempty muted">Ingen tabsdage for NB endnu – her vises, hvad exit-reglerne A–I ville have givet på dage med tab.</div>' + fLine() + '</div>';
    var i = ds.indexOf(k), day = XV.days[k], V = day.variants;
    head += '<div class="mnav"><button class="xprev" aria-label="Forrige tabsdag"' + (i <= 0 ? ' disabled' : '') + '>‹</button><span class="xdate">' + shortD(pd(k)) + '</span><button class="xnext" aria-label="Næste tabsdag"' + (i >= ds.length - 1 ? ' disabled' : '') + '>›</button></div></div>';
    var vals = XORD.split("").map(function (v) { var r = V[v] && (useM ? V[v].mnq : V[v].liquid); return r ? +r.net : 0; });
    var mx = Math.max.apply(null, vals.map(Math.abs).concat([1])), a0 = vals[0];
    var rows = XORD.split("").map(function (v, j) {
      var r = V[v]; if (!r) return "";
      var x = useM ? r.mnq : r.liquid, n = +x.net, w = Math.abs(n) / mx * 100, t = tone(n), d = n - a0;
      var tr = (r.trades || []).map(function (q) { return q.in + '→' + q.out + ' ' + q.how + ' ' + money(q.net, 0, true); }).join('<br>');
      var tipH = '<b>' + v + ' · ' + esc(r.label) + '</b> · <span class="m">' + longD(pd(k)) + '</span><br>Dagens netto: <span class="' + t + '">' + money(n, 2, true) + ' (' + pct(+x.pct, true) + ')</span>' +
        (v !== "A" ? '<br>Vs. nu (A): <span class="' + tone(d) + '">' + money(d, 2, true) + '</span>' : '') + '<br><span class="m">' + r.n + ' handel' + (r.n === 1 ? '' : 'er') + (useM ? ' · handler vist m. Liquid-gebyr' : '') + (tr ? '<br>' + tr : '') + '</span>';
      return '<div class="xr' + (v === "A" ? ' now' : '') + '" data-tip="' + esc(tipH) + '"><span class="xl">' + v + '</span><span class="xn">' + esc(XLAB[v] || r.label) + (v === "A" ? ' <span class="badge">NU</span>' : '') + '</span>' +
        '<span class="xb"><i class="' + (n < 0 ? 'br' : 'bg') + '" style="width:' + Math.max(w, 1.5).toFixed(1) + '%"></i></span><span class="xv ' + t + '">' + money(n, 0, true) + '</span></div>';
    }).join("");
    var best = XORD.split("").reduce(function (b, v, j) { return vals[j] > vals[b] ? j : b; }, 0);
    var foot = best === 0 ? 'Nuværende regel (A) var bedst denne dag.' : 'Bedst: ' + XORD[best] + ' (' + money(vals[best] - a0, 0, true) + ' vs. A). Én dag siger ikke meget – se backtestet.';
    return '<div class="panel cal xbox">' + head + '<div class="xlist">' + rows + '</div><div class="xfoot muted">' + foot + ' Replay af dagens kurs' + (day.mode === "live" ? ' (live-tjek fra NB Signal)' : '') + '.</div>' + fLine() + '</div>';
  }
  function renderExit() {
    var row = $("exitRow");
    if (view === "0" || LIQ < 0) { row.hidden = true; row.innerHTML = ""; return; }
    row.hidden = false;
    var both = view === "both";
    row.className = "row xrow" + (both ? "" : " single");
    row.innerHTML = (both ? '<div class="panel cal xph"><div class="ctitle">Exit-varianter</div><div class="muted">Kun for NB v1.1 (Liquid)</div></div>' : '') + exitBox();
    var ds = xDays(), cur = xSel && XV.days[xSel] ? xSel : ds[ds.length - 1], i = ds.indexOf(cur);
    var p = row.querySelector(".xprev"), n = row.querySelector(".xnext");
    if (p) p.onclick = function () { if (i > 0) { xSel = ds[i - 1]; renderExit(); } };
    if (n) n.onclick = function () { if (i < ds.length - 1) { xSel = ds[i + 1]; renderExit(); } };
  }

  renderAccounts = safe("konto-paneler", renderAccounts);
  renderExit = safe("exit-varianter", renderExit);
  renderTiles = safe("handelsstatistik", renderTiles);
  renderCal = safe("kalender", renderCal);
  function renderAll() { setFee(fee, false); renderAccounts(); renderTiles(); renderCal(); renderExit(); }

  function init(data) {
    D = data; accsLiq = data.accounts.map(derive); accs = accsLiq; today = pd(data.today);
    LIQ = data.accounts.findIndex(function (a) { return a.name === "Liquid"; });
    accsMnq = data.accounts.map(function (a, i) { return i === LIQ && mnqOk() ? derive(mnqAccount(a)) : accsLiq[i]; });
    $("updated").textContent = "Opdateret " + data.updated + " (dansk tid)";
    // måneder: fra første registrering til i dag
    var all = []; accs.forEach(function (a) { all = all.concat(a.dates); }); all.sort();
    var s = all.length ? pd(all[0]) : today, cy = s.getFullYear(), cm = s.getMonth();
    while (cy < today.getFullYear() || (cy === today.getFullYear() && cm <= today.getMonth())) { months.push([cy, cm]); cm++; if (cm > 11) { cm = 0; cy++; } }
    curMonth = months[months.length - 1];
    $("prevM").onclick = function () { var i = months.findIndex(function (x) { return x[0] === curMonth[0] && x[1] === curMonth[1]; }); if (i > 0) { curMonth = months[i - 1]; renderCal(); } };
    $("nextM").onclick = function () { var i = months.findIndex(function (x) { return x[0] === curMonth[0] && x[1] === curMonth[1]; }); if (i < months.length - 1) { curMonth = months[i + 1]; renderCal(); } };
    $("acctToggle").querySelectorAll("button").forEach(function (b) {
      b.onclick = function () { view = b.dataset.v; $("acctToggle").querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); renderAll(); };
    });
    document.addEventListener("mouseover", function (e) { var c = e.target.closest && e.target.closest("[data-tip]"); if (!c) return; c.onmousemove = function (ev) { showTip(c.dataset.tip, ev.clientX, ev.clientY); }; c.onmouseleave = hideTip; });
    document.addEventListener("click", function (e) {
      var c = e.target.closest && e.target.closest(".cell.hasx"); if (!c) return;
      xSel = c.dataset.x; renderExit(); var r = document.getElementById("exitRow"); if (r && r.scrollIntoView) r.scrollIntoView({behavior: "smooth", block: "nearest"});
    });
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(renderAccounts, 120); });
    // valgfri start-parametre: ?konto=0|1|both&maaned=YYYY-MM
    var q = new URLSearchParams(location.search);
    if (q.get("konto")) { var b = $("acctToggle").querySelector('[data-v="' + q.get("konto") + '"]'); if (b) b.click(); }
    if (q.get("maaned")) { var mm = q.get("maaned").split("-"), f = months.find(function (x) { return x[0] === +mm[0] && x[1] === +mm[1] - 1; }); if (f) curMonth = f; }
    var f0 = q.get("gebyr"); if (!f0) { try { f0 = localStorage.getItem(FEE_KEY); } catch (e) { f0 = null; } }
    setFee(f0 === "mnq" ? "mnq" : "liquid", false);
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
      return fetch("exit_varianter.json?t=" + Date.now(), {cache: "no-store"})
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (x) { XV = x && x.days ? x : null; }, function () { XV = null; })
        .then(function () { return fetch("f_skygge.json?t=" + Date.now(), {cache: "no-store"}); })
        .then(function (r) { return r && r.ok ? r.json() : null; }, function () { return null; })
        .then(function (x) { FS = x && x.days ? x : null; }, function () { FS = null; })
        .then(function () { return data; });
    })
    .then(function (data) {
      try { init(data); }
      catch (err) { console.error("Konti-dashboard: init-fejl", err); safe("init", function () { throw err; })(); }
    })
    .catch(function (e) {
      console.error("Konti-dashboard: data.json", e);
      document.body.insertAdjacentHTML("afterbegin", '<div class="err">Kunne ikke indlæse data.json (' + esc(e.message) + ')</div>');
    });
})();
