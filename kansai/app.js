/* パチンコホール ブログマップ - プロトタイプ
   window.REGION = { key, title, prefs:[{code,name}] } を各HTMLで定義して読み込む */
(() => {
  const R = window.REGION;
  const $ = (s, el = document) => el.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) e.append(kid?.nodeType ? kid : document.createTextNode(kid ?? ""));
    return e;
  };

  const DAY = 86400000;
  const today = new Date();
  const daysSince = (s) => (s ? Math.floor((today - new Date(s)) / DAY) : null);

  // ブログの状態: live(30日以内) / slow(31-180日) / dead(181日超) / unknown / none
  // 店舗専用ブログ(kind=own)だけを「ブログあり」として数える。共通ブログ・お知らせ欄はリンクのみ別ラベルで表示
  // 本日(端末のローカル日付)に更新があった店舗専用ブログ
  const pad2 = (n) => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const isToday = (h) => !!(h.blog && h.blog.url && h.blog.kind === "own" && h.blog.last_post === todayStr);
  const timeOf = (h) => (h.blog.last_post_at && h.blog.last_post_at.slice(0, 10) === todayStr ? h.blog.last_post_at.slice(11, 16).replace("00:00", "") : "");
  const hasOwn = (h) => !!(h.blog && h.blog.url && h.blog.kind === "own");
  const KIND_LABEL = { shared: "共通ブログ", notice: "お知らせ" };
  function blogStatus(h) {
    if (!hasOwn(h)) return "none";
    const d = daysSince(h.blog.last_post);
    if (d === null) return "unknown";
    return d <= 30 ? "live" : d <= 180 ? "slow" : "dead";
  }
  // 発信の柱は X / LINE / 店舗専用ブログ。ピンの色: 緑=更新中のブログあり / 青=X・LINE等あり / 灰=発信リンクなし
  const hasX = (h) => !!h.x, hasLine = (h) => !!h.line;
  const reach = (h) => (hasX(h) ? 1 : 0) + (hasLine(h) ? 1 : 0) + (hasOwn(h) ? 1 : 0);
  function pinStatus(h) {
    if (isToday(h)) return "today";
    if (blogStatus(h) === "live") return "live";
    if (hasX(h) || hasLine(h)) return "sns";
    return h.blog && h.blog.url ? (blogStatus(h) === "dead" ? "stale" : "sns") : "none"; // 休止中ブログだけの店は薄いピン
  }
  const STATUS_LABEL = { live: "更新あり", slow: "更新まばら", dead: "休止中", unknown: "更新日不明", none: "ブログなし" };

  const state = { halls: [], cities: null, scope: { type: "region" }, onlyLive: false, onlyToday: false, onlyBlog: false, onlyX: false, onlyLine: false };
  const cityName = new Map(); // code -> {name, pref}
  const prefOfCode = (c) => c.slice(0, 2);
  // 東京の島嶼部(大島町〜小笠原村 = 13361以降)は遠く離れているので、表示範囲の計算から除く
  const isIsland = (code) => code.startsWith("13") && +code.slice(2) >= 361;
  const mainland = () => ({ type: "FeatureCollection", features: state.cities.features.filter((f) => !isIsland(f.properties.N03_007)) });

  // ---------- 背景地図 ----------
  const svg = d3.select("#bgmap");
  const gZoom = svg.append("g");
  const gCities = gZoom.append("g").attr("class", "cities");
  const gPins = gZoom.append("g").attr("class", "pins");
  let path, proj, W, H, geoByCode = new Map();

  function setupProjection() {
    W = innerWidth; H = innerHeight;
    svg.attr("width", W).attr("height", H);
    // 横長画面では地図を右寄りに、縦長画面では上寄せ(下はリストが乗る)
    const pad = W > 900 ? { l: W * 0.38, r: 30, t: 70, b: 30 } : { l: 10, r: 10, t: 110, b: H * 0.25 };
    state.pad = pad;
    proj = d3.geoMercator().fitExtent([[pad.l, pad.t], [W - pad.r, H - pad.b]], mainland());
    path = d3.geoPath(proj);
  }

  function drawMap() {
    gCities.selectAll("path").remove();
    gCities.selectAll("path").data(state.cities.features).join("path")
      .attr("d", path)
      .attr("data-pref", (d) => prefOfCode(d.properties.N03_007))
      .attr("data-code", (d) => d.properties.N03_007)
      .attr("class", "c");
    geoByCode = new Map(state.cities.features.map((f) => [f.properties.N03_007, f]));
    drawPins();
  }

  function boundsOf(features) {
    return path.bounds({ type: "FeatureCollection", features });
  }

  function focus(scope, animate = true) {
    state.scope = scope;
    let feats;
    if (scope.type === "city") feats = [geoByCode.get(scope.code)];
    else if (scope.type === "pref") feats = state.cities.features.filter((f) => prefOfCode(f.properties.N03_007) === scope.code && !isIsland(f.properties.N03_007));
    else feats = mainland().features;
    feats = feats.filter(Boolean);
    const [[x0, y0], [x1, y1]] = boundsOf(feats);
    const { l, r, t, b } = state.pad;
    const aw = W - l - r, ah = H - t - b;
    const k = Math.min(scope.type === "city" ? 40 : 14, 0.82 / Math.max((x1 - x0) / aw, (y1 - y0) / ah));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const tx = l + aw / 2 - k * cx, ty = t + ah / 2 - k * cy;
    const tr = d3.zoomIdentity.translate(tx, ty).scale(k);
    gZoom.transition().duration(animate ? 1100 : 0).ease(d3.easeCubicInOut)
      .attr("transform", tr.toString());
    gCities.selectAll("path").style("stroke-width", `${1 / k}px`);
    gPins.selectAll("g.pin").attr("transform", (d) => `translate(${d.xy}) scale(${1 / k})`);
    state.k = k;
    gCities.selectAll("path").attr("class", (d) => {
      const code = d.properties.N03_007;
      if (scope.type === "city") return code === scope.code ? "c on" : prefOfCode(code) === prefOfCode(scope.code) ? "c near" : "c";
      if (scope.type === "pref") return prefOfCode(code) === scope.code ? "c on" : "c";
      return "c";
    });
    drawPins();
    document.documentElement.dataset.scope = scope.type;
  }

  function drawPins() {
    const s = state.scope;
    let list = [];
    if (s.type === "city") list = state.halls.filter((h) => h.city === s.code);
    else if (s.type === "pref") list = state.halls.filter((h) => h.pref_code === s.code);
    list = list.filter((h) => h.lat && h.lon).map((h) => ({ ...h, xy: proj([h.lon, h.lat]), st: pinStatus(h) }));
    const k = state.k || 1;
    const sel = gPins.selectAll("g.pin").data(list, (d) => d.id);
    sel.exit().remove();
    const enter = sel.enter().append("g").attr("class", "pin");
    enter.filter((d) => d.st === "today").append("circle").attr("class", "ring").attr("r", 0).transition().duration(700).attr("r", s.type === "city" ? 16 : 9);
    enter.append("circle").attr("class", "dot").attr("r", 0).transition().duration(700).attr("r", (d) => (s.type === "city" ? 7 : 3.5) * (d.st === "today" ? 1.7 : 1));
    enter.append("title").text((d) => d.name);
    gPins.selectAll("g.pin").attr("data-st", (d) => d.st).attr("transform", (d) => `translate(${d.xy}) scale(${1 / k})`)
      .on("click", (_, d) => document.getElementById("h-" + d.id)?.scrollIntoView({ behavior: "smooth", block: "center" }))
      .on("mouseenter", (_, d) => hallZoom(d)).on("mouseleave", () => window.HallMap && window.HallMap.hide());
  }

  // ---------- 現在地からの所要時間(目安) ----------
  // 位置情報はボタンを押した時だけブラウザに許可を求め、端末内で距離を計算するだけ(どこにも送らない)
  let here = null;
  const locate = () => new Promise((ok, ng) => here ? ok(here) : !navigator.geolocation ? ng(new Error("nogeo")) :
    navigator.geolocation.getCurrentPosition((p) => ok((here = { lat: p.coords.latitude, lon: p.coords.longitude })), ng, { timeout: 10000, maximumAge: 300000 }));
  const distKm = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
    const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const fmtMin = (m) => (m < 60 ? `${Math.max(1, Math.round(m))}分` : `${Math.floor(m / 60)}時間${Math.round(m % 60)}分`);
  const gmaps = (h, mode) => `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lon}&travelmode=${mode}`;
  function routeRow(h) {
    if (!h.lat || !h.lon) return "";
    const out = el("span", { class: "route-out" });
    const row = el("div", { class: "route" });
    const showEst = (pos) => {
      const d = distKm(pos, h);
      row.classList.add("done");
      out.textContent = d > 80 ? `直線 約${Math.round(d)}km(遠いのでGoogleマップで確認)` : `直線 ${d.toFixed(1)}km ／ 🚶徒歩 約${fmtMin((d * 1.25) / 0.08)} ／ 🚗車 約${fmtMin((d * 1.4) / 0.5 + 3)}(目安)`;
    };
    const btn = el("button", { class: "route-btn", type: "button", onclick: () => {
      out.textContent = "現在地を取得中…";
      locate().then(showEst, () => { out.textContent = "現在地を取得できませんでした(ブラウザの位置情報を許可してください)"; });
    } }, "📍 今から行くと?");
    row.append(btn, out,
      el("a", { class: "route-go", href: gmaps(h, "transit"), target: "_blank", rel: "noopener" }, "電車"),
      el("a", { class: "route-go", href: gmaps(h, "driving"), target: "_blank", rel: "noopener" }, "車"),
      el("a", { class: "route-go", href: gmaps(h, "walking"), target: "_blank", rel: "noopener" }, "徒歩"));
    if (here) showEst(here);
    return row;
  }

  // ---------- リスト描画 ----------
  function hallCard(h) {
    const st = blogStatus(h);
    const d = h.blog ? daysSince(h.blog.last_post) : null;
    const links = [];
    if (h.x) links.push(el("a", { class: "lnk x", href: h.x, target: "_blank", rel: "noopener" }, "X"));
    if (h.line) links.push(el("a", { class: "lnk line", href: h.line, target: "_blank", rel: "noopener" }, "LINE"));
    if (h.blog?.url) {
      const own = hasOwn(h);
      links.push(el("a", { class: "lnk " + (own ? "blog" : "sub"), href: h.blog.url, target: "_blank", rel: "noopener" }, own ? "ブログ" : KIND_LABEL[h.blog.kind] || "ブログ", own && h.blog.platform ? el("small", {}, h.blog.platform) : ""));
    }
    const meta = [];
    if (hasOwn(h)) {
      meta.push(el("span", { class: "badge " + st }, STATUS_LABEL[st]));
      if (d !== null) meta.push(el("span", { class: "meta" }, d === 0 ? "最終更新 今日" : `最終更新 ${d}日前`));
      if (h.blog.posts_90d != null) meta.push(el("span", { class: "meta" }, `直近90日 ${h.blog.posts_90d}件`));
    } else {
      meta.push(el("span", { class: "badge none" }, h.blog?.url ? `専用ブログなし(${KIND_LABEL[h.blog.kind] || "他"}あり)` : h.checked ? "ブログなし" : "未調査"));
    }
    const tod = isToday(h);
    return el("article", { class: "hall " + st + (pinStatus(h) === "stale" ? " stale" : "") + (tod ? " today" : ""), id: "h-" + h.id, "data-st": st, onmouseenter: () => hallZoom(h), onmouseleave: () => window.HallMap && window.HallMap.hide() },
      tod ? el("div", { class: "today-ribbon" }, "🔥 本日更新", timeOf(h) ? el("small", {}, timeOf(h)) : "") : "",
      el("h4", {}, h.name),
      h.address ? el("p", { class: "addr" }, h.address) : "",
      el("div", { class: "metas" }, meta),
      links.length ? el("div", { class: "links" }, links) : "",
      routeRow(h));
  }
  const hallZoom = (h) => {
    if (!window.HallMap) return;
    window.HallMap.show({ lat: h.lat, lon: h.lon, __today: isToday(h) });
    // スマホ: 下の地図の枠にカードが隠れないよう、タップしたカードを上寄せにする
    if (window.matchMedia("(hover: none)").matches) document.getElementById("h-" + h.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function render() {
    const root = $("#content");
    root.replaceChildren();
    const passes = (h) => (!state.onlyToday || isToday(h)) && (!state.onlyBlog || hasOwn(h)) && (!state.onlyLive || blogStatus(h) === "live") && (!state.onlyX || hasX(h)) && (!state.onlyLine || hasLine(h));
    const rank = { today: -1, live: 0, sns: 1, stale: 2, none: 3 }; // 並び順: 更新中ブログ > X・LINEあり > なし。同順位は発信チャネルの多い順
    for (const p of R.prefs) {
      const halls = state.halls.filter((h) => h.pref_code === p.code);
      const shown = halls.filter(passes);
      const nLive = halls.filter((h) => blogStatus(h) === "live").length, nToday = halls.filter(isToday).length;
      const nBlog = halls.filter(hasOwn).length;
      const nX = halls.filter(hasX).length, nLine = halls.filter(hasLine).length;
      const sec = el("section", { class: "pref", id: "pref-" + p.code, "data-code": p.code },
        el("header", {},
          el("h2", {}, p.name),
          el("p", { class: "stats" }, `${halls.length}店 ／ X ${nX} ／ LINE ${nLine} ／ 専用ブログ ${nBlog}(更新中 ${nLive})` + (nToday ? ` ／ 🔥本日更新 ${nToday}` : ""))));
      // 市区町村チップ
      const cities = [...new Set(state.cities.features.filter((f) => prefOfCode(f.properties.N03_007) === p.code).map((f) => f.properties.N03_007))]
        .sort();
      const chips = el("nav", { class: "chips" });
      const cityBlocks = [];
      for (const c of cities) {
        const ch = shown.filter((h) => h.city === c).sort((a, b) => rank[pinStatus(a)] - rank[pinStatus(b)] || reach(b) - reach(a) || a.name.localeCompare(b.name, "ja"));
        const all = halls.filter((h) => h.city === c).length;
        if (!all) continue;
        const nm = cityName.get(c).name;
        chips.append(el("button", { class: "chip", "data-code": c, onclick: () => goCity(c) }, nm, el("b", {}, all)));
        cityBlocks.push(el("div", { class: "city", id: "city-" + c, "data-code": c },
          el("h3", {}, nm, el("span", {}, `${all}店`)),
          ch.length ? el("div", { class: "grid" }, ch.map(hallCard)) : el("p", { class: "empty" }, "条件に合うホールがありません")));
      }
      const unk = shown.filter((h) => !h.city);
      sec.append(chips, ...cityBlocks);
      if (unk.length) sec.append(el("div", { class: "city" }, el("h3", {}, "市区町村 未判定"), el("div", { class: "grid" }, unk.map(hallCard))));
      root.append(sec);
    }
    observe();
  }

  // ---------- タブ & スクロール ----------
  function buildTabs() {
    const tabs = $("#tabs");
    tabs.append(el("button", { class: "tab", "data-code": "all", onclick: () => { scrollTo({ top: 0, behavior: "smooth" }); focus({ type: "region" }); } }, "全体"));
    for (const p of R.prefs) tabs.append(el("button", { class: "tab", "data-code": p.code, onclick: () => goPref(p.code) }, p.name.replace(/[都府県]$/, "")));
  }
  const headerH = () => $("#top").offsetHeight + 8;
  function scrollToEl(node) {
    const y = node.getBoundingClientRect().top + scrollY - headerH();
    scrollTo({ top: y, behavior: "smooth" });
  }
  function goPref(code) { lock(); focus({ type: "pref", code }); scrollToEl($("#pref-" + code)); markTab(code); }
  function goCity(code) { lock(); focus({ type: "city", code }); scrollToEl($("#city-" + code)); markTab(prefOfCode(code)); }
  let locked = 0, progUntil = 0;
  // タブ/チップ操作による自動スクロール中は、スクロール連動のフォーカスを止める(最大4秒、スクロールが止まって0.3秒後に解除)
  function lock() { locked = Date.now() + 1300; progUntil = Date.now() + 4000; }
  function markTab(code) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.code === code));
    const t = $(`.tab[data-code="${code}"]`);
    t?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }

  // スクロールに合わせて地図のフォーカスも追従
  let io;
  function observe() {
    io?.disconnect();
    io = new IntersectionObserver((ents) => {
      if (Date.now() < locked) return;
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!vis) return;
      const n = vis.target;
      if (n.classList.contains("city")) {
        const code = n.dataset.code; if (!code) return;
        if (state.scope.code !== code) { focus({ type: "city", code }); markTab(prefOfCode(code)); }
      }
    }, { rootMargin: `-${headerH() + 40}px 0px -60% 0px` });
    document.querySelectorAll(".city[data-code]").forEach((n) => io.observe(n));
  }
  addEventListener("scroll", () => {
    if (Date.now() < progUntil) locked = Date.now() + 300;
    if (scrollY < 120 && state.scope.type !== "region" && Date.now() > locked) { focus({ type: "region" }); markTab("all"); }
  }, { passive: true });

  // ---------- 起動 ----------
  async function main() {
    // data/{key}_embedded.js があればそれを使う(ダブルクリックで開く file:// でも動くように)。無ければ fetch
    const emb = window.EMBEDDED && window.EMBEDDED[R.key];
    const [cities, halls] = emb ? [emb.cities, emb.halls] : await Promise.all([
      fetch(`${R.key}_cities.geojson?v=${Date.now()}`).then((r) => r.json()),
      fetch(`data/${R.key}_halls.json?v=${Date.now()}`).then((r) => r.json()),
    ]);
    state.cities = cities;
    for (const f of cities.features) {
      const p = f.properties;
      cityName.set(p.N03_007, { name: (p.N03_003 || "") + p.N03_004, pref: p.N03_001 });
    }
    state.halls = halls.halls.map((h, i) => ({ ...h, id: h.id ?? i, pref_code: h.pref_code ?? h.city?.slice(0, 2) }));
    // 県の並びは店舗数の多い順(関東なら東京から、関西なら大阪から)
    const cnt = {}; for (const h of state.halls) cnt[h.pref_code] = (cnt[h.pref_code] || 0) + 1;
    R.prefs.sort((a, b) => (cnt[b.code] || 0) - (cnt[a.code] || 0));
    $("#meta").textContent = `データ更新: ${halls.generated} ／ ${halls.note || ""}`;
    buildTabs();
    setupProjection(); drawMap(); focus({ type: "region" }, false);
    render();
    markTab("all");
    for (const id of ["f-today", "f-x", "f-line", "f-blog", "f-live"]) $("#" + id).checked = false; // ブラウザの入力復元で勝手にチェックが入らないようにする
    $("#f-today").addEventListener("change", (e) => { state.onlyToday = e.target.checked; render(); });
    $("#f-live").addEventListener("change", (e) => { state.onlyLive = e.target.checked; render(); });
    $("#f-x").addEventListener("change", (e) => { state.onlyX = e.target.checked; render(); });
    $("#f-line").addEventListener("change", (e) => { state.onlyLine = e.target.checked; render(); });
    $("#f-blog").addEventListener("change", (e) => { state.onlyBlog = e.target.checked; render(); });
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { setupProjection(); drawMap(); focus(state.scope, false); }, 200); });
  }
  main();
})();
