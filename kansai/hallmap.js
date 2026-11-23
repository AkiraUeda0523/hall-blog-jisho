/* ホールにカーソルを合わせる(0.3秒止まる)と、背景の地図がその店へ寄り、周りの建物が3Dで立ち上がる。
   MapLibre GL JS + OpenFreeMap(OpenStreetMapの無料ベクトルタイル)。文字ラベルは出さない(フォント不要)。
   window.HallMap.show(hall) / hide() を app.js から呼ぶ。MapLibreが読めない場合は何もしない */
(() => {
  const DWELL = 300;   // 止まってから寄るまで(ms)
  const LEAVE = 900;   // カーソルが外れてから地図を消すまで(ms)
  let quietUntil = 0, map = null, marker = null, markerEl = null, tShow = 0, tHide = 0, failed = false;
  const box = () => document.getElementById("hallmap");
  const sheet = () => window.innerWidth < 900;                        // 狭い画面: 下から出る地図の枠(ボトムシート)
  const canHover = window.matchMedia("(hover: hover)").matches;
  const setOn = (on) => { const b = box(); if (!b) return; b.classList.toggle("on", on); document.body.classList.toggle("hm-on", on && sheet()); };
  let closeBtn = null;
  function ensureClose() {
    if (closeBtn) return;
    closeBtn = document.createElement("button"); closeBtn.id = "hallmap-close"; closeBtn.type = "button"; closeBtn.textContent = "✕ 地図を閉じる";
    closeBtn.addEventListener("click", () => { quietUntil = Date.now() + 900; clearTimeout(tShow); setOn(false); }); document.body.append(closeBtn);
  }

  const STYLE = {
    version: 8,
    sources: { omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0b0d12" } },
      { id: "landcover", type: "fill", source: "omt", "source-layer": "landcover", paint: { "fill-color": "#0e1a17", "fill-opacity": 0.8 } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": "#102019", "fill-opacity": 0.9 } },
      { id: "landuse", type: "fill", source: "omt", "source-layer": "landuse", paint: { "fill-color": "#131826", "fill-opacity": 0.7 } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": "#0e1b33" } },
      { id: "road-minor", type: "line", source: "omt", "source-layer": "transportation", minzoom: 13, filter: ["in", "class", "minor", "service", "track", "path"],
        paint: { "line-color": "#262d40", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.4, 18, 3] } },
      { id: "road-major", type: "line", source: "omt", "source-layer": "transportation", filter: ["in", "class", "motorway", "trunk", "primary", "secondary", "tertiary"],
        paint: { "line-color": "#39435c", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 18, 7] } },
      { id: "rail", type: "line", source: "omt", "source-layer": "transportation", filter: ["==", "class", "rail"], paint: { "line-color": "#4a5470", "line-width": 1.2, "line-dasharray": [3, 3] } },
      { id: "building-3d", type: "fill-extrusion", source: "omt", "source-layer": "building", minzoom: 14,
        paint: {
          "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, "#1f2840", 40, "#2c4263", 120, "#40628c"],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.92
        } }
    ]
  };

  function init() {
    if (map || failed) return;
    if (!window.maplibregl) { failed = true; return; }
    try {
      map = new maplibregl.Map({ container: "hallmap", style: STYLE, center: [139.7671, 35.6812], zoom: 9, pitch: 0, interactive: false, attributionControl: false, fadeDuration: 0 });
      map.on("error", () => {});
    } catch (e) { failed = true; map = null; }
  }

  function setMarker(h) {
    if (!markerEl) { markerEl = document.createElement("div"); markerEl.className = "hm-pin"; }
    markerEl.dataset.today = h.__today ? "1" : "";
    if (!marker) marker = new maplibregl.Marker({ element: markerEl, anchor: "center" });
    marker.setLngLat([h.lon, h.lat]).addTo(map);
  }

  function fly(h) {
    init(); if (!map) return;
    // 広い画面: 左は一覧なので、店が右側の見える部分の中央に来るようにずらす。狭い画面: 地図は下の枠なのでそのまま中央
    const padding = sheet() ? { top: 0, left: 0, right: 0, bottom: 0 } : { left: Math.min(560, window.innerWidth * 0.38) + 24, top: 0, right: 0, bottom: 0 };
    setMarker(h); ensureClose();
    setOn(true);
    map.resize();
    map.flyTo({ center: [h.lon, h.lat], zoom: 17.3, pitch: 62, bearing: -25, padding, duration: 2200, essential: true });
  }

  window.HallMap = {
    show(h) {
      if (!h || !h.lat || !h.lon || Date.now() < quietUntil) return;
      clearTimeout(tHide); clearTimeout(tShow);
      tShow = setTimeout(() => fly(h), DWELL);
    },
    hide() {
      clearTimeout(tShow); clearTimeout(tHide);
      if (sheet() && !canHover) return;                                  // スマホは「✕」で閉じる(指を離しても消さない)
      tHide = setTimeout(() => setOn(false), LEAVE);
    }
  };
})();
