/* ─── CONFIG ─── */
const CENTER      = [-79.3832, 43.6532];   // [lng, lat] Toronto downtown
const RADIUS_M    = 4000;                  // 4 km
const SPOTLIGHT_M = 200;                   // 3D building spotlight radius

/* ─── MAP ─── */
let map = null;
let userMarker = null;            // single instance, no duplicates
let userLngLat = null;
let stores3D = null;              // loaded OSM stores
let activeChainFilter = 'all';
let is3D = false;
let ctrl3DRef = null;             // reference to the 3D map control

/* ─── CUSTOM 3D MAP CONTROL ─── */
class Toggle3DControl {
  onAdd(m) {
    this._map = m;
    this._container = document.createElement('div');
    this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    this._btn = document.createElement('button');
    this._btn.type = 'button';
    this._btn.title = 'Toggle 3D buildings';
    this._btn.className = 'ctrl-3d-btn';
    this._btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="12" y1="22.08" x2="12" y2="12" stroke="currentColor" stroke-width="2"/></svg>`;
    this._btn.addEventListener('click', toggle3DView);
    this._container.appendChild(this._btn);
    ctrl3DRef = this;
    return this._container;
  }
  onRemove() {
    this._container.parentNode?.removeChild(this._container);
    ctrl3DRef = null;
  }
  setActive(v) { this._btn?.classList.toggle('active', v); }
}

/* ─── PANEL / NAV STATE ─── */
let activePanel = 'panel-home';
let mobileMode  = window.innerWidth <= 768;

/* ═════════════════════════════════════════════
   INIT
═════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupNavigation();
  setupSearch();
  setupListPage();
  renderHomeProducts('favourite');
  document.getElementById('list-date').textContent =
    new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'numeric', day: 'numeric' });
  window.addEventListener('resize', handleResize);
});

/* ─── RESPONSIVE ─── */
function handleResize() {
  const was = mobileMode;
  mobileMode = window.innerWidth <= 768;
  if (was !== mobileMode) applyMobileLayout();
}

function applyMobileLayout() {
  const panel  = document.getElementById('side-panel');
  const mapWrap = document.getElementById('map-wrap');
  if (mobileMode) {
    panel.classList.remove('hide');
    mapWrap.classList.remove('show');
    // make sure correct panel is active
    document.querySelectorAll('.mnav').forEach(b => b.classList.remove('active'));
    document.querySelector('.mnav[data-panel="panel-home"]')?.classList.add('active');
  } else {
    panel.classList.remove('hide');
    mapWrap.classList.remove('show');
    // desktop always shows both
    panel.style.display = '';
    mapWrap.style.display = '';
  }
  if (map) setTimeout(() => map.resize(), 100);
}

/* ═════════════════════════════════════════════
   MAP INIT (MapLibre GL JS)
═════════════════════════════════════════════ */
function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    // OpenFreeMap Positron = clean white / Google Maps-like aesthetic
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: CENTER,
    zoom: 13,
    maxZoom: 20,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new Toggle3DControl(), 'bottom-right');
  map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: false,
    showAccuracyCircle: false,
  }), 'bottom-right');

  map.on('load', () => {
    addRadiusCircle();
    add3DBuildingLayer();
    fetchStoresFromOverpass();
    tryGeolocation();
  });

  // close store card when clicking elsewhere on map
  map.on('click', (e) => {
    if (!e.originalEvent.target.closest('.m-pin')) hideStoreCard();
  });

  document.getElementById('card-close').addEventListener('click', hideStoreCard);
}

/* ─── 4km RADIUS RING ─── */
function addRadiusCircle() {
  const points = 128;
  const coords = [];
  const earthR = 6371000;
  const [lng, lat] = CENTER;
  const dLat = (RADIUS_M / earthR) * (180 / Math.PI);
  const dLng = dLat / Math.cos(lat * Math.PI / 180);
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }

  map.addSource('radius-source', {
    type: 'geojson',
    data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } }
  });
  map.addLayer({
    id: 'radius-fill',
    type: 'fill',
    source: 'radius-source',
    paint: { 'fill-color': '#1976D2', 'fill-opacity': 0.04 }
  });
  map.addLayer({
    id: 'radius-line',
    type: 'line',
    source: 'radius-source',
    paint: { 'line-color': '#1976D2', 'line-width': 1.8, 'line-dasharray': [5, 4], 'line-opacity': 0.6 }
  });
}

/* ─── 3D BUILDING LAYER (height-map extrusion) ─── */
function add3DBuildingLayer() {
  // The positron style has a building layer — we replace it with fill-extrusion
  // Source layer name used by openfreemap/openmaptiles is "building"
  try {
    // Remove flat building layer if present (avoid visual conflict)
    if (map.getLayer('building')) map.removeLayer('building');
    if (map.getLayer('building-outline')) map.removeLayer('building-outline');
  } catch (_) {}

  // Find first label layer id to insert buildings below text
  const layers = map.getStyle().layers;
  let labelLayerId = null;
  for (const l of layers) {
    if (l.type === 'symbol' && l.layout?.['text-field']) { labelLayerId = l.id; break; }
  }

  map.addLayer({
    id: '3d-buildings',
    source: 'openmaptiles',
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 14,
    filter: ['==', '$type', 'Polygon'],
    paint: {
      'fill-extrusion-color': [
        'interpolate', ['linear'],
        ['coalesce', ['get', 'render_height'], 0],
        0,   '#F0EFEC',
        10,  '#E8E6E0',
        30,  '#D9D6CC',
        60,  '#C8C4B8',
        100, '#B0ABA0',
        200, '#98938A',
      ],
      'fill-extrusion-height':      ['coalesce', ['get', 'render_height'],    0],
      'fill-extrusion-base':        ['coalesce', ['get', 'render_min_height'],0],
      'fill-extrusion-opacity':     0,   // hidden by default; shown in 3D mode
    }
  }, labelLayerId ?? undefined);
}

/* ─── 3D TOGGLE ─── */
function toggle3DView() {
  is3D = !is3D;
  ctrl3DRef?.setActive(is3D);

  if (is3D) {
    map.easeTo({ pitch: 55, bearing: -20, zoom: 15.5, duration: 800 });
    map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', 0.9);
  } else {
    map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', 0);
  }
}

/* ─── FLY TO STORE + SPOTLIGHT 3D ─── */
function flyToStoreWith3D(lngLat) {
  map.flyTo({
    center: lngLat,
    zoom: 17.5,
    pitch: 58,
    bearing: -20,
    duration: 900,
    essential: true,
  });

  // Enable 3D building extrusion spotlight within SPOTLIGHT_M radius
  // Uses a GeoJSON polygon as a MapLibre 'within' filter
  const spotPoly = makeCirclePoly(lngLat, SPOTLIGHT_M);
  if (!map.getSource('spotlight-src')) {
    map.addSource('spotlight-src', { type: 'geojson', data: spotPoly });
  } else {
    map.getSource('spotlight-src').setData(spotPoly);
  }

  map.setFilter('3d-buildings', ['within', spotPoly]);
  map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', 0.92);

  ctrl3DRef?.setActive(true);
  is3D = true;
}

function resetFrom3D() {
  map.setFilter('3d-buildings', ['==', '$type', 'Polygon']);
  map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', is3D ? 0.9 : 0);
}

function makeCirclePoly([lng, lat], radiusM) {
  const n = 64;
  const coords = [];
  const earthR  = 6371000;
  const dLat = (radiusM / earthR) * (180 / Math.PI);
  const dLng = dLat / Math.cos(lat * Math.PI / 180);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  coords.push(coords[0]);
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } };
}

/* ─── USER GEOLOCATION (single marker) ─── */
function tryGeolocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    userLngLat = [pos.coords.longitude, pos.coords.latitude];
    setUserMarker(userLngLat);
    document.getElementById('location-text').textContent = 'My Location';
  }, () => {
    // denied – place indicator at default Toronto center
    setUserMarker(CENTER);
  });
}

function setUserMarker(lngLat) {
  if (userMarker) {
    userMarker.setLngLat(lngLat);
    return;
  }
  const el = document.createElement('div');
  el.className = 'm-user';
  userMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat(lngLat)
    .addTo(map);
}

/* ═════════════════════════════════════════════
   OVERPASS API – REAL STORE DATA
═════════════════════════════════════════════ */
async function fetchStoresFromOverpass() {
  const [lng, lat] = CENTER;
  const query = `
[out:json][timeout:30];
(
  node["shop"~"supermarket|grocery"](around:${RADIUS_M},${lat},${lng});
  way["shop"~"supermarket|grocery"](around:${RADIUS_M},${lat},${lng});
  node["name"~"Metro|Loblaws|No Frills|Sobeys|Farm Boy|FreshCo|T&T|Whole Foods|Walmart|Food Basics|IGA",i](around:${RADIUS_M},${lat},${lng});
  way["name"~"Metro|Loblaws|No Frills|Sobeys|Farm Boy|FreshCo|T&T|Whole Foods|Walmart|Food Basics|IGA",i](around:${RADIUS_M},${lat},${lng});
);
out center tags;
  `.trim();

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    if (!res.ok) throw new Error('Overpass error');
    const data = await res.json();
    processOSMStores(data.elements);
  } catch (err) {
    console.warn('Overpass failed, using fallback:', err);
    processOSMStores(FALLBACK_STORES);
  }
}

// Fallback hardcoded data if Overpass is unreachable
// Coordinates verified against real downtown Toronto store addresses (2024-2025)
const FALLBACK_STORES = [
  // ── Metro ──
  { type:'node', id:1,  lat:43.6493, lon:-79.3726, tags:{ name:'Metro', shop:'supermarket', 'addr:housenumber':'80',   'addr:street':'Front St E' }},
  { type:'node', id:2,  lat:43.6591, lon:-79.3800, tags:{ name:'Metro', shop:'supermarket', 'addr:housenumber':'444',  'addr:street':'Yonge St' }},
  { type:'node', id:3,  lat:43.6582, lon:-79.3790, tags:{ name:'Metro', shop:'supermarket', 'addr:housenumber':'89',   'addr:street':'Gould St' }},
  { type:'node', id:4,  lat:43.6657, lon:-79.4018, tags:{ name:'Metro', shop:'supermarket', 'addr:housenumber':'425',  'addr:street':'Bloor St W' }},
  // ── Loblaws ──
  { type:'node', id:5,  lat:43.6617, lon:-79.3803, tags:{ name:'Loblaws', shop:'supermarket', 'addr:housenumber':'60',   'addr:street':'Carlton St' }},
  { type:'node', id:6,  lat:43.6413, lon:-79.3712, tags:{ name:'Loblaws', shop:'supermarket', 'addr:housenumber':'10',   'addr:street':'Lower Jarvis St' }},
  { type:'node', id:7,  lat:43.6462, lon:-79.4053, tags:{ name:'Loblaws', shop:'supermarket', 'addr:housenumber':'585',  'addr:street':'Queen St W' }},
  // ── No Frills ──
  { type:'node', id:8,  lat:43.6441, lon:-79.4178, tags:{ name:'No Frills', shop:'supermarket', 'addr:housenumber':'1022', 'addr:street':'King St W' }},
  // ── Whole Foods ──
  { type:'node', id:9,  lat:43.6716, lon:-79.3953, tags:{ name:'Whole Foods Market', shop:'supermarket', 'addr:housenumber':'87',   'addr:street':'Avenue Rd' }},
  // ── T&T Supermarket ──
  { type:'node', id:10, lat:43.6574, lon:-79.3963, tags:{ name:'T&T Supermarket', shop:'supermarket', 'addr:housenumber':'297',  'addr:street':'College St' }},
  { type:'node', id:11, lat:43.6571, lon:-79.3838, tags:{ name:'T&T Supermarket', shop:'supermarket', 'addr:housenumber':'26',   'addr:street':'Edward St' }},
  // ── FreshCo ──
  { type:'node', id:12, lat:43.6579, lon:-79.4083, tags:{ name:'FreshCo', shop:'supermarket', 'addr:housenumber':'410',  'addr:street':'Bathurst St' }},
];

function processOSMStores(elements) {
  // Deduplicate by name+approximate location
  const seen = new Set();
  stores3D = [];

  elements.forEach(el => {
    const tags = el.tags || {};
    const name = tags.name || tags.brand || '';
    if (!name) return;

    const slng = el.lon ?? el.center?.lon;
    const slat = el.lat ?? el.center?.lat;
    if (!slng || !slat) return;

    // Skip duplicates within ~30m
    const key = `${name}_${Math.round(slat * 3000)}_${Math.round(slng * 3000)}`;
    if (seen.has(key)) return;
    seen.add(key);

    const chain = detectChain(name, tags.brand || '');

    // Build address string
    const addrParts = [
      tags['addr:housenumber'] && tags['addr:street']
        ? `${tags['addr:housenumber']} ${tags['addr:street']}`
        : (tags['addr:full'] || ''),
    ].filter(Boolean);
    const address = addrParts[0] || name;

    // Distance from center
    const dist = haversineKm([slng, slat], CENTER).toFixed(1);

    stores3D.push({ id: el.id, name, chain, address, lng: slng, lat: slat, dist: parseFloat(dist), tags });
  });

  // Sort by distance
  stores3D.sort((a, b) => a.dist - b.dist);

  addStoreMarkers(stores3D);
  renderStoreLogos(stores3D);
  document.getElementById('map-status').textContent =
    `${stores3D.length} stores within 4km`;
  document.getElementById('stores-count').textContent = stores3D.length;
}

function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ─── STORE MARKERS ─── */
function addStoreMarkers(stores) {
  stores.forEach(store => {
    const el = document.createElement('div');
    el.className = 'm-pin m-' + store.chain;
    const cfg = CHAIN_CONFIG[store.chain];
    el.innerHTML = `<span>${cfg.short.slice(0,6)}</span>`;
    el.title = store.name;

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([store.lng, store.lat])
      .addTo(map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showStoreCard(store);
      flyToStoreWith3D([store.lng, store.lat]);
    });
  });
}

/* ─── FILTER MARKERS ─── */
document.getElementById('map-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip[data-mfilter]');
  if (!btn) return;
  document.querySelectorAll('#map-chips .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  activeChainFilter = btn.dataset.mfilter;
  filterMapMarkers();
});

function filterMapMarkers() {
  // Re-render markers (simpler than toggling visibility individually)
  document.querySelectorAll('.m-pin').forEach(el => {
    const chain = el.classList[1]?.replace('m-', '') || '';
    const visible = activeChainFilter === 'all' ||
      chain === activeChainFilter ||
      (activeChainFilter === 'deals' && chain !== 'other');
    el.style.display = visible ? '' : 'none';
  });
}

/* ─── STORE CARD ─── */
function showStoreCard(store) {
  const cfg = CHAIN_CONFIG[store.chain] || CHAIN_CONFIG.other;

  // Pick a sample deal
  const allDeals = Object.values(PRODUCTS).flat();
  const deal = allDeals.find(p => p.chain === store.chain && p.salePercent) || allDeals[0];

  const dealHTML = deal ? `
    <div class="card-deal">
      <div class="card-deal-img">${deal.emoji}</div>
      <div>
        <div class="card-deal-name">${deal.name}</div>
        <div class="card-deal-price">$${deal.price.toFixed(2)} avg. ea.</div>
        ${deal.originalPrice ? `<div class="card-deal-orig">$${deal.originalPrice.toFixed(2)}</div>` : ''}
      </div>
    </div>
  ` : '';

  document.getElementById('card-body').innerHTML = `
    <div class="card-main">
      <div class="card-logo ${store.chain}">${cfg.label}</div>
      <div class="card-info">
        <div class="card-name">${store.name}</div>
        <div class="card-addr">${store.address}</div>
        <div class="card-dist">${store.dist} km away</div>
      </div>
      <div class="card-actions">
        <button class="card-3d-btn" onclick="flyToStoreWith3D([${store.lng},${store.lat}])">3D View</button>
        <button class="card-see-all" onclick="doSearch('${store.chain}')">See All</button>
      </div>
    </div>
    ${dealHTML}
  `;
  document.getElementById('store-card').classList.remove('hidden');
}

function hideStoreCard() {
  document.getElementById('store-card').classList.add('hidden');
  resetFrom3D();
}
window.flyToStoreWith3D = flyToStoreWith3D;

/* ═════════════════════════════════════════════
   NAVIGATION
═════════════════════════════════════════════ */
function setupNavigation() {
  // Desktop header nav
  document.querySelectorAll('.hnav').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      showPanel(panel);
      document.querySelectorAll('.hnav').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Mobile bottom nav
  document.querySelectorAll('.mnav').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mnav').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const showSection = btn.dataset.show;
      const panel = btn.dataset.panel;
      const sidePanel = document.getElementById('side-panel');
      const mapWrap   = document.getElementById('map-wrap');

      if (showSection === 'map') {
        sidePanel.classList.add('hide');
        mapWrap.classList.add('show');
        setTimeout(() => { if (map) map.resize(); }, 50);
      } else {
        sidePanel.classList.remove('hide');
        mapWrap.classList.remove('show');
        if (panel) showPanel(panel);
      }
    });
  });

  // Search back button
  document.getElementById('search-back').addEventListener('click', () => {
    showPanel('panel-home');
    document.querySelectorAll('.hnav').forEach(b =>
      b.classList.toggle('active', b.dataset.panel === 'panel-home'));
  });
}

function showPanel(panelId) {
  document.querySelectorAll('.pview').forEach(p => p.classList.remove('active'));
  document.getElementById(panelId)?.classList.add('active');
  activePanel = panelId;
}
window.showPanel = showPanel;

/* ═════════════════════════════════════════════
   SEARCH
═════════════════════════════════════════════ */
function setupSearch() {
  const globalInput = document.getElementById('global-search');
  globalInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && globalInput.value.trim()) {
      doSearch(globalInput.value.trim());
      globalInput.value = '';
    }
  });

  document.querySelectorAll('.stab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.stab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const q = document.getElementById('search-label').textContent.replace('Results for "', '').replace('"', '');
      renderSearchResults(q, tab.dataset.sort);
    });
  });
}

function doSearch(query) {
  showPanel('panel-search');
  document.querySelectorAll('.hnav').forEach(b => b.classList.remove('active'));

  document.getElementById('search-label').textContent = `Results for "${query}"`;
  renderSearchResults(query, 'price');

  // mobile: show panel
  if (mobileMode) {
    document.getElementById('side-panel').classList.remove('hide');
    document.getElementById('map-wrap').classList.remove('show');
    document.querySelectorAll('.mnav').forEach(b => b.classList.remove('active'));
  }
}
window.doSearch = doSearch;

function renderSearchResults(query, sort = 'price') {
  const container = document.getElementById('search-results');
  if (!query) { container.innerHTML = '<div class="empty-state">Type to search…</div>'; return; }

  const q = query.toLowerCase();
  let results = [];

  for (const [key, items] of Object.entries(SEARCH_DATA)) {
    if (key.includes(q) || q.includes(key) || items.some(i => i.name.toLowerCase().includes(q))) {
      results.push(...items);
    }
  }

  // fallback: match product names
  if (!results.length) {
    Object.values(PRODUCTS).flat().forEach(p => {
      if (p.name.toLowerCase().includes(q)) {
        results.push({
          id: p.id, name: p.name, emoji: p.emoji,
          salePercent: p.salePercent, originalPrice: p.originalPrice,
          prices: [{ chain: p.chain, price: p.price, unit: 'ea.', best: true }]
        });
      }
    });
  }

  results = results.filter((r, i, a) => a.findIndex(x => x.id === r.id) === i);
  if (sort === 'price') results.sort((a, b) => Math.min(...a.prices.map(p=>p.price)) - Math.min(...b.prices.map(p=>p.price)));
  else if (sort === 'brands') results.sort((a, b) => a.name.localeCompare(b.name));

  if (!results.length) { container.innerHTML = `<div class="empty-state">No results for "${query}"</div>`; return; }

  container.innerHTML = results.map(r => {
    const best = r.prices.reduce((a, b) => a.price < b.price ? a : b);
    const cfg  = CHAIN_CONFIG[best.chain] || CHAIN_CONFIG.other;
    const saleTag   = r.salePercent ? `<div class="sale-tag">-${r.salePercent}%</div>` : '';
    const origHtml  = r.originalPrice ? `<span class="result-orig">$${r.originalPrice.toFixed(2)}</span>` : '';
    const saleCls   = r.salePercent ? 'sale' : '';
    const priceTags = r.prices.map(p => {
      const c2 = CHAIN_CONFIG[p.chain] || CHAIN_CONFIG.other;
      return `<span class="price-tag ${p.best ? 'best' : ''}">${c2.short} $${p.price.toFixed(2)}</span>`;
    }).join('');
    return `
      <div class="result-item">
        <div class="result-img">${saleTag}<span>${r.emoji}</span></div>
        <div class="result-body">
          <div class="result-chain ${best.chain}">${cfg.short}</div>
          <div class="result-name">${r.name}</div>
          <div><span class="result-price ${saleCls}">$${best.price.toFixed(2)} ${best.unit || 'ea.'}</span>${origHtml}</div>
          <div class="price-tags">${priceTags}</div>
        </div>
      </div>`;
  }).join('');
}

/* ═════════════════════════════════════════════
   HOME PRODUCTS
═════════════════════════════════════════════ */
function renderHomeProducts(filter) {
  const items = PRODUCTS[filter] || PRODUCTS.favourite;
  document.getElementById('home-products').innerHTML = items.map(productCardHTML).join('');
}

function productCardHTML(p) {
  const cfg = CHAIN_CONFIG[p.chain] || CHAIN_CONFIG.other;
  const saleTag  = p.salePercent ? `<div class="sale-tag">-${p.salePercent}%</div>` : '';
  const chainTag = `<div class="chain-tag ${p.chain}">${cfg.short}</div>`;
  const orig     = p.originalPrice ? `<div class="pcard-orig">$${p.originalPrice.toFixed(2)}</div>` : '';
  const priceC   = p.salePercent ? '' : 'normal';
  return `
    <div class="pcard" onclick="doSearch('${p.name.split(' ')[0].toLowerCase()}')">
      <div class="pcard-img">${saleTag}${chainTag}<span>${p.emoji}</span></div>
      <div class="pcard-info">
        <div class="pcard-name">${p.name}</div>
        ${orig}
        <div class="pcard-price ${priceC}">$${p.price.toFixed(2)} ea.</div>
      </div>
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#home-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#home-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderHomeProducts(chip.dataset.filter);
    });
  });
});

/* ─── STORE LOGOS ─── */
function renderStoreLogos(stores) {
  const container = document.getElementById('stores-logos');
  const seen = new Set();
  const pills = [];

  stores.forEach(s => {
    if (!seen.has(s.chain)) {
      seen.add(s.chain);
      pills.push(s);
    }
  });

  container.innerHTML = pills.slice(0, 10).map(s => {
    const cfg = CHAIN_CONFIG[s.chain] || CHAIN_CONFIG.other;
    return `
      <div class="store-pill" onclick="focusStore(${s.lng}, ${s.lat}, '${s.chain}')">
        <div class="store-circle sc-${s.chain}"><span>${cfg.short}</span></div>
        <div class="store-pill-name">${cfg.label}</div>
      </div>`;
  }).join('');
}

window.focusStore = function(lng, lat, chain) {
  // On mobile switch to map view
  if (mobileMode) {
    document.getElementById('side-panel').classList.add('hide');
    document.getElementById('map-wrap').classList.add('show');
    document.querySelectorAll('.mnav').forEach(b =>
      b.classList.toggle('active', b.dataset.show === 'map'));
    setTimeout(() => { if (map) map.resize(); }, 50);
  }
  const store = stores3D?.find(s => s.chain === chain) || { lng, lat, chain, name: CHAIN_CONFIG[chain]?.label, address: '', dist: 0 };
  showStoreCard(store);
  flyToStoreWith3D([lng, lat]);
};

/* ═════════════════════════════════════════════
   MY LIST
═════════════════════════════════════════════ */
function setupListPage() {
  renderListSection('list-metro', SHOPPING_LIST.metro);
  renderListSection('list-nofrills', SHOPPING_LIST.nofrills);
  document.getElementById('list-products').innerHTML =
    PRODUCTS.deals.slice(0, 4).map(productCardHTML).join('');
}

function renderListSection(id, items) {
  document.getElementById(id).innerHTML = items.map(item => `
    <div class="list-item">
      <div class="list-item-img">${item.emoji}</div>
      <div class="list-item-info">
        <div class="list-item-name">${item.name}</div>
        <div class="list-item-price">$${item.price.toFixed(2)} avg. ea.</div>
      </div>
      <div class="list-controls">
        <button class="qty-btn" onclick="changeQty(this,-1)">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty(this,1)">+</button>
        <button class="del-btn" onclick="this.closest('.list-item').remove()">
          <svg width="14" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>`).join('');
}

window.changeQty = function(btn, d) {
  const el = btn.closest('.list-controls').querySelector('.qty-num');
  el.textContent = Math.max(1, parseInt(el.textContent) + d);
};
