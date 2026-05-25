/* ─── CONFIG ─── */
const CENTER      = [-79.3832, 43.6532];   // [lng, lat] Toronto downtown
const RADIUS_M    = 4000;                  // 4 km
const SPOTLIGHT_M = 200;                   // 3D building spotlight radius

const CHAIN_LOGOS = {
  metro:    'icons/metro.png',
  loblaws:  'icons/loblaws.png',
  nofrills: 'icons/nofrills.png',
  tandt:    'icons/tnt.png',
  freshco:  'icons/freshco.png',
  farmboy:  'icons/farmboy.png',
  longos:   'icons/longos.png',
};

const CHAIN_LOGOS1 = {
  metro:    'icons/metro1.png',
  loblaws:  'icons/loblaws1.png',
  nofrills: 'icons/nofrills1.png',
  tandt:    'icons/tnt1.png',
  freshco:  'icons/freshco1.png',
  farmboy:  'icons/farmboy1.png',
  longos:   'icons/longos1.png',
};

/* ─── MAP ─── */
let map = null;
let userMarker = null;            // single instance, no duplicates
let userLngLat = null;
let stores3D = null;              // loaded OSM stores
let activeChainFilter = 'all';
let is3D = false;
let ctrl3DRef = null;             // reference to the 3D map control
const loadingStoreLogoImages = new Set();
let storeMarkerLayersReady = false;

const STORE_SOURCE_ID = 'store-markers-source';
const STORE_DOT_LAYER_ID = 'store-marker-dot';
const STORE_ICON_LAYER_PREFIX = 'store-marker-icon';
const STORE_LABEL_LAYER_ID = 'store-marker-label';
const STORE_BADGE_LAYER_ID = 'store-marker-badge';
const STORE_BADGE_TEXT_LAYER_ID = 'store-marker-badge-text';

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
function setupScrollFade(el) {
  if (!el) return;
  const update = () => {
    const atStart = el.scrollLeft <= 2;
    const atEnd   = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
    const left    = atStart ? 'black 0%' : 'transparent 0%, black 40px';
    const right   = atEnd   ? 'black 100%' : 'black calc(100% - 40px), transparent 100%';
    const mask = `linear-gradient(to right, ${left}, ${right})`;
    el.style.webkitMaskImage = mask;
    el.style.maskImage = mask;
  };
  el.addEventListener('scroll', update, { passive: true });
  update();
}

document.addEventListener('DOMContentLoaded', () => {
  // Render UI first so a map init failure (e.g. no WebGL in headless) can't break the rest
  try { setupNavigation(); } catch (e) { console.error(e); }
  try { setupSearch(); } catch (e) { console.error(e); }
  try { setupListPage(); } catch (e) { console.error(e); }
  try { setupCardSwipe(); } catch (e) { console.error(e); }
  try { renderHomeProducts('favourite'); } catch (e) { console.error(e); }
  try { initMap(); } catch (e) { console.error(e); }
  window.addEventListener('resize', handleResize);
  try { setupScrollFade(document.getElementById('home-chips')); } catch (e) {}
  try { setupScrollFade(document.getElementById('map-home-chips')); } catch (e) {}
  try { setupScrollFade(document.querySelector('.mobile-stores-section .stores-logos')); } catch (e) {}
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
    is3D = true;
    ctrl3DRef?.setActive(true);
    map.easeTo({ pitch: 55, bearing: -20, zoom: 15.5, duration: 1200 });
    map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', 0.9);
    fetchStoresFromOverpass();
    tryGeolocation();
  });

  // close store card when clicking elsewhere on map
  map.on('click', (e) => {
    const layerIds = [
      STORE_DOT_LAYER_ID,
      ...storeIconLayerIds(),
      STORE_LABEL_LAYER_ID,
      STORE_BADGE_LAYER_ID,
      STORE_BADGE_TEXT_LAYER_ID,
    ].filter(id => map.getLayer(id));
    const hit = layerIds.length > 0 &&
      map.queryRenderedFeatures(e.point, { layers: layerIds }).length > 0;
    if (!hit) hideStoreCard();
  });

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
        0,   '#FFFFFF',
        10,  '#F7F6F4',
        30,  '#F0EDE8',
        60,  '#E8E4DC',
        100, '#DDD8D0',
        200, '#D0C8C0',
      ],
      'fill-extrusion-height':      ['coalesce', ['get', 'render_height'],    0],
      'fill-extrusion-base':        ['coalesce', ['get', 'render_min_height'],0],
      'fill-extrusion-opacity':     0,   // set to 0.9 after auto-enable
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

  map.setPaintProperty('3d-buildings', 'fill-extrusion-opacity', 0.92);
  ctrl3DRef?.setActive(true);
  is3D = true;
}

function resetFrom3D() {
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
  navigator.geolocation.getCurrentPosition(async pos => {
    userLngLat = [pos.coords.longitude, pos.coords.latitude];
    setUserMarker(userLngLat);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      const addr = data.address || {};
      const label = addr.postcode || addr.neighbourhood || addr.suburb || addr.city_district || 'My Location';
      document.querySelectorAll('#location-text').forEach(el => el.textContent = label);
    } catch {
      document.querySelectorAll('#location-text').forEach(el => el.textContent = 'My Location');
    }
  }, () => {
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

// Fallback hardcoded data – verified from official store locators + Nominatim/near-place geocoding
const FALLBACK_STORES = [
  // ── Metro (metro.ca confirmed: Front St E, Gould St, Bloor W, Yonge, College) ──
  { type:'node', id:1,  lat:43.6494, lon:-79.3733, tags:{ name:'Metro',           shop:'supermarket', 'addr:housenumber':'80',  'addr:street':'Front St E' }},
  { type:'node', id:2,  lat:43.6584, lon:-79.3765, tags:{ name:'Metro',           shop:'supermarket', 'addr:housenumber':'89',  'addr:street':'Gould St' }},
  { type:'node', id:3,  lat:43.6662, lon:-79.4049, tags:{ name:'Metro',           shop:'supermarket', 'addr:housenumber':'425', 'addr:street':'Bloor St W' }},
  { type:'node', id:4,  lat:43.6606, lon:-79.3834, tags:{ name:'Metro',           shop:'supermarket', 'addr:housenumber':'444', 'addr:street':'Yonge St' }},
  { type:'node', id:5,  lat:43.6542, lon:-79.4194, tags:{ name:'Metro',           shop:'supermarket', 'addr:housenumber':'735', 'addr:street':'College St' }},
  // ── Loblaws (loblaws.ca confirmed: Carlton, Lower Jarvis, Bloor W) ──
  { type:'node', id:6,  lat:43.6620, lon:-79.3799, tags:{ name:'Loblaws',         shop:'supermarket', 'addr:housenumber':'60',  'addr:street':'Carlton St' }},
  { type:'node', id:7,  lat:43.6443, lon:-79.3698, tags:{ name:'Loblaws',         shop:'supermarket', 'addr:housenumber':'10',  'addr:street':'Lower Jarvis St' }},
  { type:'node', id:8,  lat:43.6696, lon:-79.3886, tags:{ name:'Loblaws',         shop:'supermarket', 'addr:housenumber':'55',  'addr:street':'Bloor St W' }},
  // ── No Frills (261 Richmond St W "Bo's No Frills", 1022 King St W) ──
  { type:'node', id:9,  lat:43.6489, lon:-79.3912, tags:{ name:'No Frills',       shop:'supermarket', 'addr:housenumber':'261', 'addr:street':'Richmond St W' }},
  { type:'node', id:10, lat:43.6415, lon:-79.4156, tags:{ name:'No Frills',       shop:'supermarket', 'addr:housenumber':'1022','addr:street':'King St W' }},
  // ── Farm Boy (farmboy.ca confirmed: Bay St) ──
  { type:'node', id:11, lat:43.6606, lon:-79.3846, tags:{ name:'Farm Boy',        shop:'supermarket', 'addr:housenumber':'777', 'addr:street':'Bay St' }},
  // ── T&T Supermarket (confirmed: College St, Edward St) ──
  { type:'node', id:12, lat:43.6567, lon:-79.4005, tags:{ name:'T&T Supermarket', shop:'supermarket', 'addr:housenumber':'297', 'addr:street':'College St' }},
  { type:'node', id:13, lat:43.6569, lon:-79.3824, tags:{ name:'T&T Supermarket', shop:'supermarket', 'addr:housenumber':'26',  'addr:street':'Edward St' }},
  // ── FreshCo (freshco.com confirmed) ──
  { type:'node', id:14, lat:43.6597, lon:-79.3656, tags:{ name:'FreshCo',         shop:'supermarket', 'addr:housenumber':'325', 'addr:street':'Parliament St' }},
  { type:'node', id:15, lat:43.6542, lon:-79.4070, tags:{ name:'FreshCo',         shop:'supermarket', 'addr:housenumber':'410', 'addr:street':'Bathurst St' }},
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

/* ─── STORE MARKERS (HTML overlay: indicator dot + PNG logo on top) ─── */
function dealCountForStore(store) {
  const seen = new Set();
  let count = 0;
  Object.values(PRODUCTS).flat().forEach(p => {
    if (p.chain === store.chain && p.salePercent && !seen.has(p.id)) {
      seen.add(p.id);
      count++;
    }
  });
  if (count > 0) return count;
  const seed = Math.abs(Math.floor(store.lng * 1000) + Math.floor(store.lat * 1000));
  return 5 + (seed % 26);
}

function addStoreMarkers(stores) {
  ensureStoreMarkerLayers();
  setStoreMarkerData(stores);
  loadStoreLogoImages().then(() => {
    addMissingStoreIconLayers();
    setStoreMarkerData(stores);
    filterMapMarkers();
  });
}

function setStoreMarkerData(stores) {
  const source = map.getSource(STORE_SOURCE_ID);
  if (!source) return;

  const features = stores.filter(s => s.chain !== 'wholefoods').map(store => {
    const cfg = CHAIN_CONFIG[store.chain] || CHAIN_CONFIG.other;
    const count = dealCountForStore(store);
    const candidateLogoId = storeLogoImageId(store.chain);
    const logoId = CHAIN_LOGOS[store.chain] && map.hasImage(candidateLogoId) ? candidateLogoId : '';
    return {
      type: 'Feature',
      properties: {
        id: String(store.id),
        chain: store.chain,
        short: cfg.short.slice(0, 6),
        count: String(count),
        hasLogo: Boolean(logoId),
      },
      geometry: { type: 'Point', coordinates: [store.lng, store.lat] },
    };
  });

  source.setData({ type: 'FeatureCollection', features });
  filterMapMarkers();
}

function ensureStoreMarkerLayers() {
  if (storeMarkerLayersReady || map.getSource(STORE_SOURCE_ID)) return;
  addStoreMarkerLayers();
  storeMarkerLayersReady = true;
}

function addStoreMarkerLayers() {
  if (map.getSource(STORE_SOURCE_ID)) return;

  map.addSource(STORE_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: STORE_DOT_LAYER_ID,
    type: 'circle',
    source: STORE_SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 13, 15, 19, 17, 23],
      'circle-color': [
        'match', ['get', 'chain'],
        'metro', '#E31837',
        'loblaws', '#1B5E20',
        'nofrills', '#FFD600',
        'farmboy', '#2E7D32',
        'freshco', '#E53935',
        'tandt', '#C0392B',
        'longos', '#6B2D8B',
        '#757575',
      ],
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-width': 2.5,
      'circle-pitch-alignment': 'viewport',
    },
  });

  map.addLayer({
    id: STORE_LABEL_LAYER_ID,
    type: 'symbol',
    source: STORE_SOURCE_ID,
    layout: {
      'text-field': ['get', 'short'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 12, 6, 15, 7.5, 17, 8],
      'text-font': ['Noto Sans Bold'],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-opacity': ['case', ['get', 'hasLogo'], 0, 1],
      'text-color': [
        'match', ['get', 'chain'],
        'nofrills', '#000000',
        '#FFFFFF',
      ],
    },
  });

  map.addLayer({
    id: STORE_BADGE_LAYER_ID,
    type: 'circle',
    source: STORE_SOURCE_ID,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 7, 15, 9, 17, 11],
      'circle-color': '#F90000',
      'circle-translate': [16, -16],
      'circle-translate-anchor': 'viewport',
      'circle-pitch-alignment': 'viewport',
    },
  });

  map.addLayer({
    id: STORE_BADGE_TEXT_LAYER_ID,
    type: 'symbol',
    source: STORE_SOURCE_ID,
    layout: {
      'text-field': ['get', 'count'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 12, 8, 15, 10, 17, 12],
      'text-font': ['Noto Sans Bold'],
      'text-offset': [0, 0],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#FFFFFF',
      'text-translate': [16, -16],
      'text-translate-anchor': 'viewport',
    },
  });

  addMissingStoreIconLayers();

  const openStoreFromFeature = (e) => {
    const id = e.features?.[0]?.properties?.id;
    const store = stores3D?.find(s => String(s.id) === String(id));
    if (!store) return;
    showStoreCard(store);
    flyToStoreWith3D([store.lng, store.lat]);
  };

  [
    STORE_DOT_LAYER_ID,
    ...storeIconLayerIds(),
    STORE_LABEL_LAYER_ID,
    STORE_BADGE_LAYER_ID,
    STORE_BADGE_TEXT_LAYER_ID,
  ].forEach(layerId => {
    map.on('click', layerId, openStoreFromFeature);
    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
  });
}

function addMissingStoreIconLayers() {
  Object.keys(CHAIN_LOGOS).forEach(chain => {
    const layerId = storeIconLayerId(chain);
    const imageId = storeLogoImageId(chain);
    if (map.getLayer(layerId) || !map.getSource(STORE_SOURCE_ID) || !map.hasImage(imageId)) return;

    // No beforeId → appended on TOP, so PNG sits over the dot indicator
    map.addLayer({
      id: layerId,
      type: 'symbol',
      source: STORE_SOURCE_ID,
      filter: ['==', ['get', 'chain'], chain],
      layout: {
        'icon-image': imageId,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.22, 15, 0.32, 17, 0.38],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'viewport',
        'icon-pitch-alignment': 'viewport',
      },
    });
  });
}

function storeLogoImageId(chain) {
  return `store-logo-${chain}`;
}

function storeIconLayerId(chain) {
  return `${STORE_ICON_LAYER_PREFIX}-${chain}`;
}

function storeIconLayerIds() {
  return Object.keys(CHAIN_LOGOS).map(storeIconLayerId);
}

function loadStoreLogoImages() {
  return Promise.all(
    Object.entries(CHAIN_LOGOS).map(([chain, src]) =>
      loadStoreLogoImage(storeLogoImageId(chain), src)
    )
  );
}

function loadStoreLogoImage(imageId, src) {
  if (map.hasImage(imageId)) return Promise.resolve(true);
  if (loadingStoreLogoImages.has(imageId)) return Promise.resolve(false);
  loadingStoreLogoImages.add(imageId);

  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      loadingStoreLogoImages.delete(imageId);
      if (!map.hasImage(imageId)) map.addImage(imageId, image);
      resolve(true);
    };
    image.onerror = () => {
      loadingStoreLogoImages.delete(imageId);
      resolve(false);
    };
    image.src = src;
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
  if (!map?.getLayer(STORE_DOT_LAYER_ID)) return;
  const chainFilter = activeChainFilter === 'all'
    ? null
    : activeChainFilter === 'deals'
      ? ['!=', ['get', 'chain'], 'other']
      : ['==', ['get', 'chain'], activeChainFilter];

  [
    STORE_DOT_LAYER_ID,
    STORE_LABEL_LAYER_ID,
    STORE_BADGE_LAYER_ID,
    STORE_BADGE_TEXT_LAYER_ID,
  ].forEach(layerId => {
    if (map.getLayer(layerId)) map.setFilter(layerId, chainFilter);
  });

  Object.keys(CHAIN_LOGOS).forEach(chain => {
    const layerId = storeIconLayerId(chain);
    if (!map.getLayer(layerId)) return;
    const iconFilter = ['==', ['get', 'chain'], chain];
    map.setFilter(layerId, chainFilter ? ['all', iconFilter, chainFilter] : iconFilter);
  });
}

/* ─── STORE CARD ─── */
function showStoreCard(store) {
  const cfg = CHAIN_CONFIG[store.chain] || CHAIN_CONFIG.other;
  const logoSrc = CHAIN_LOGOS1[store.chain];

  // Pick several deals from this chain (fall back to any) so the expanded sheet has content
  const allProducts = Object.values(PRODUCTS).flat();
  const seen = new Set();
  const deals = allProducts.filter(p => {
    if (p.chain !== store.chain) return false;
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  if (deals.length < 3) {
    allProducts.forEach(p => {
      if (deals.length >= 5) return;
      if (seen.has(p.id)) return;
      seen.add(p.id);
      deals.push(p);
    });
  }

  const dealsHTML = deals.slice(0, 6).map(p => {
    const badges = [];
    if (p.salePercent) badges.push(`<span class="sc-badge sc-badge--sale">-${p.salePercent}%</span>`);
    if (p.id % 2 === 0) badges.push(`<span class="sc-badge sc-badge--pts">125pt</span>`);
    return `
      <div class="sc-item">
        <div class="sc-item-img">
          <div class="sc-item-badges">${badges.join('')}</div>
          <span class="sc-item-emoji">${p.emoji}</span>
        </div>
        <div class="sc-item-body">
          <div class="sc-item-head">
            <div class="sc-item-name">${p.name}</div>
            <button class="sc-item-add" aria-label="Add">+</button>
          </div>
          <div class="sc-item-price">$${p.price.toFixed(2)} avg. ea.</div>
          ${p.originalPrice ? `<div class="sc-item-orig">$${p.originalPrice.toFixed(2)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('card-body').innerHTML = `
    <div class="sc-top">
      <div class="sc-logo ${store.chain}">
        ${logoSrc ? `<img src="${logoSrc}" alt="${cfg.label}" onerror="this.style.display='none'">` : cfg.label}
      </div>
      <button class="sc-see-all" id="sc-see-all" onclick="toggleStoreCardSheet()">See All</button>
    </div>
    <div class="sc-info">
      <div class="sc-name">${store.name}</div>
      ${store.address ? `<div class="sc-addr">${store.address}</div>` : ''}
      ${store.dist != null ? `<div class="sc-dist">${store.dist} km away</div>` : ''}
    </div>
    <div class="sc-items">${dealsHTML}</div>
  `;
  document.getElementById('store-card').classList.remove('hidden');
}

function hideStoreCard() {
  const card = document.getElementById('store-card');
  card.classList.add('hidden');
  card.classList.remove('expanded');
  card.scrollTop = 0;
  resetFrom3D();
}

function setupCardSwipe() {
  const card = document.getElementById('store-card');
  const handle = document.getElementById('card-handle');
  let startY = 0, deltaY = 0, dragging = false, startedExpanded = false, activePtrId = null;

  const onDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const inItems   = e.target.closest('.sc-items');
    const isExpanded = card.classList.contains('expanded');

    // When EXPANDED, the .sc-items area is the scrollable list — let native
    // scroll handle drags there. Everywhere else (handle, logo row, store
    // info) acts as a drag affordance to collapse / dismiss the sheet.
    if (isExpanded && inItems) return;
    // When COLLAPSED, allow drag from anywhere (small surface, no real scroll needed).

    dragging = true;
    activePtrId = e.pointerId;
    startedExpanded = isExpanded;
    startY = e.clientY;
    deltaY = 0;
    card.style.transition = 'none';
    try { card.setPointerCapture(e.pointerId); } catch {}
  };

  const onMove = (e) => {
    if (!dragging || e.pointerId !== activePtrId) return;
    deltaY = e.clientY - startY;
    // Only translate on downward drag (upward "expand" shouldn't yank the card up)
    card.style.transform = `translateY(${Math.max(0, deltaY)}px)`;
    e.preventDefault();
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    activePtrId = null;
    card.style.transition = '';
    card.style.transform = '';
    const THRESHOLD = 60;
    if (startedExpanded) {
      if (deltaY > 180) hideStoreCard();
      else if (deltaY > THRESHOLD) card.classList.remove('expanded');
    } else {
      if (deltaY < -THRESHOLD) card.classList.add('expanded');
      else if (deltaY > 80) hideStoreCard();
    }
    syncSeeAllLabel();
  };

  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onUp);

  // Tap handle to toggle (when it wasn't a real drag)
  handle.addEventListener('click', () => {
    if (Math.abs(deltaY) > 5) return;
    card.classList.toggle('expanded');
    syncSeeAllLabel();
    deltaY = 0;
  });
}

function syncSeeAllLabel() {
  const btn = document.getElementById('sc-see-all');
  if (!btn) return;
  const card = document.getElementById('store-card');
  btn.textContent = card.classList.contains('expanded') ? 'Close' : 'See All';
}

window.toggleStoreCardSheet = function() {
  const card = document.getElementById('store-card');
  if (card.classList.contains('expanded')) {
    card.classList.remove('expanded');
  } else {
    card.classList.add('expanded');
    card.scrollTop = 0;
  }
  syncSeeAllLabel();
};

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
  const saleBadge = p.salePercent
    ? `<div class="pcard-sale-badge">-${p.salePercent}%</div>` : '';
  const origPrice = p.originalPrice
    ? `<div class="pcard-h-orig">$${p.originalPrice.toFixed(2)} ea.</div>` : '';
  const logoSrc = CHAIN_LOGOS[p.chain];
  const brandCircle = logoSrc
    ? `<div class="pcard-brand-circle sc-${p.chain} has-logo"><img src="${logoSrc}" alt="${cfg.short}"></div>`
    : `<div class="pcard-brand-circle sc-${p.chain}"><span>${cfg.short}</span></div>`;
  return `
    <div class="pcard-wrap">
      <div class="pcard-new-badge">New!</div>
      <div class="pcard-h">
        <div class="pcard-h-row" onclick="doSearch('${p.name.split(' ')[0].toLowerCase()}')">
          <div class="pcard-h-img">
            ${saleBadge}
            <span>${p.emoji}</span>
          </div>
          <div class="pcard-h-body">
            ${brandCircle}
            <div class="pcard-h-name">${p.name}</div>
            <div class="pcard-h-price">$${p.price.toFixed(2)} ea.</div>
            ${origPrice}
            <div class="pcard-qty-row">
              <button class="pcard-add-btn" onclick="event.stopPropagation();pcardExpandQty(this)">+</button>
              <div class="pcard-qty-ctrl">
                <button class="pcard-qty-btn" onclick="event.stopPropagation();pcardChangeQty(this,-1)">−</button>
                <span class="pcard-qty-num">1</span>
                <button class="pcard-qty-btn" onclick="event.stopPropagation();pcardChangeQty(this,1)">+</button>
              </div>
            </div>
          </div>
        </div>
        <div class="pcard-save-bar hidden">
          <button class="list-pill-cancel" onclick="pcardCancelQty(this)">Cancel</button>
          <button class="list-pill-save" onclick="pcardSaveQty(this)">Save</button>
        </div>
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

  // Mobile map overlay: sync chips and search with home panel
  document.querySelectorAll('#map-home-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#map-home-chips .chip').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('#home-chips .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === chip.dataset.filter);
      });
      chip.classList.add('active');
      renderHomeProducts(chip.dataset.filter);
    });
  });

  const mapSearchInput = document.getElementById('map-search-input');
  mapSearchInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && mapSearchInput.value.trim()) {
      doSearch(mapSearchInput.value.trim());
      mapSearchInput.value = '';
    }
  });

  // Ensure home products are visible even if first DOMContentLoaded had an error
  renderHomeProducts('favourite');
});

/* ─── STORE LOGOS ─── */
function renderStoreLogos(stores) {
  const seen = new Set();
  const pills = [];
  stores.forEach(s => {
    if (!seen.has(s.chain) && s.chain !== 'wholefoods') {
      seen.add(s.chain);
      pills.push(s);
    }
  });

  const html = pills.slice(0, 10).map(s => {
    const cfg = CHAIN_CONFIG[s.chain] || CHAIN_CONFIG.other;
    const logoSrc = CHAIN_LOGOS[s.chain];
    const circleInner = logoSrc
      ? `<img src="${logoSrc}" alt="${cfg.short}">`
      : `<span>${cfg.short}</span>`;
    const hasLogo = logoSrc ? ' has-logo' : '';
    return `
      <div class="store-pill" onclick="focusStore(${s.lng}, ${s.lat}, '${s.chain}')">
        <div class="store-circle sc-${s.chain}${hasLogo}">${circleInner}</div>
        <div class="store-pill-name">${cfg.label}</div>
      </div>`;
  }).join('');

  const desktop = document.getElementById('stores-logos');
  if (desktop) desktop.innerHTML = html;
  const mobile = document.getElementById('mobile-stores-logos');
  if (mobile) mobile.innerHTML = html;
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
const LL_TRASH_SVG = `<svg width="18" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M6.5 7l1 12.2A1.5 1.5 0 0 0 9 20.5h6a1.5 1.5 0 0 0 1.5-1.3L17.5 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const LL_MINUS_SVG = `<svg width="12" height="2" viewBox="0 0 12 2" fill="none"><path d="M1 1h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const LL_PLUS_SVG  = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

function setupListPage() {
  // Date — 5/22/2026 style (M/D/YYYY)
  const d = new Date(2026, 4, 22); // mock matches Figma; replace w/ Date.now() if you want live
  document.getElementById('list-date').textContent =
    `${d.getMonth()+1}/ ${d.getDate()} / ${d.getFullYear()}`;

  renderLLSection('list-metro', SHOPPING_LIST.metro);
  renderLLSection('list-nofrills', SHOPPING_LIST.nofrills);
  renderLLSuggest();
  updateLLSummary();
}

function renderLLSection(id, items) {
  document.getElementById(id).innerHTML = items.map(item => `
    <div class="lcard" data-price="${item.price}" data-qty="${item.qty}">
      <div class="lcard-img">${item.emoji}</div>
      <div class="lcard-body">
        <div class="lcard-name">${item.name}</div>
        <button class="lcard-del" aria-label="Remove" onclick="llRemove(this)">${LL_TRASH_SVG}</button>
        <div class="lcard-price">$${item.price.toFixed(2)} avg. ea.</div>
        <div class="lcard-qty">
          <button class="lcard-qty-btn" aria-label="Decrease" onclick="llChangeQty(this,-1)">${LL_MINUS_SVG}</button>
          <span class="lcard-qty-num">${item.qty}</span>
          <button class="lcard-qty-btn" aria-label="Increase" onclick="llChangeQty(this,1)">${LL_PLUS_SVG}</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderLLSuggest() {
  const suggestions = PRODUCTS.favourite.slice(0, 6);
  document.getElementById('list-products').innerHTML = suggestions.map(p => {
    const cfg  = CHAIN_CONFIG[p.chain] || CHAIN_CONFIG.other;
    const logo = CHAIN_LOGOS[p.chain];
    const brandClass = `sc-${p.chain}`;
    const brandInner = logo
      ? `<img src="${logo}" alt="${cfg.label}" onerror="this.style.display='none'">`
      : cfg.short;
    return `
      <div class="lpcard">
        <div class="lpcard-img">
          <span class="lpcard-brand ${brandClass}${logo ? ' has-logo' : ''}">${brandInner}</span>
          <button class="lpcard-add" aria-label="Add to list" onclick="lpcardExpand(this)">+</button>
          <span>${p.emoji}</span>
        </div>
        <div class="lpcard-body">
          <div class="lpcard-name">${p.name}</div>
          <div class="lpcard-price-row">
            <div class="lpcard-price">$${p.price.toFixed(2)}</div>
            <div class="lpcard-qty-ctrl">
              <button class="lpcard-qty-btn" onclick="lpcardChangeQty(this,-1)">−</button>
              <span class="lpcard-qty-num">1</span>
              <button class="lpcard-qty-btn" onclick="lpcardChangeQty(this,1)">+</button>
            </div>
          </div>
        </div>
        <div class="lpcard-save-bar hidden">
          <button class="list-pill-cancel" onclick="lpcardCancel(this)">Cancel</button>
          <button class="list-pill-save" onclick="lpcardSave(this)">Save</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ─── lpcard add/qty/save pattern (mirrors home pcard) ─── */
window.lpcardExpand = function(btn) {
  const card = btn.closest('.lpcard');
  btn.style.display = 'none';
  card.querySelector('.lpcard-qty-ctrl').classList.add('show');
  card.querySelector('.lpcard-save-bar').classList.remove('hidden');
};

window.lpcardCancel = function(btn) {
  const card = btn.closest('.lpcard');
  card.querySelector('.lpcard-qty-num').textContent = '1';
  card.querySelector('.lpcard-qty-ctrl').classList.remove('show');
  card.querySelector('.lpcard-add').style.display = '';
  card.querySelector('.lpcard-save-bar').classList.add('hidden');
};

window.lpcardSave = function(btn) {
  const card = btn.closest('.lpcard');
  card.querySelector('.lpcard-qty-ctrl').classList.remove('show');
  card.querySelector('.lpcard-add').style.display = '';
  card.querySelector('.lpcard-save-bar').classList.add('hidden');
};

window.lpcardChangeQty = function(btn, d) {
  const card = btn.closest('.lpcard');
  const el = card.querySelector('.lpcard-qty-num');
  const next = parseInt(el.textContent) + d;
  if (next < 1) { lpcardCancel(btn); return; }
  el.textContent = next;
};

function updateLLSummary() {
  let total = 0, save = 0;
  document.querySelectorAll('#panel-list .lcard').forEach(card => {
    const price = parseFloat(card.dataset.price) || 0;
    const qty   = parseInt(card.dataset.qty) || 0;
    total += price * qty;
  });
  // mock savings as 30% of total for now
  save = total * 0.30;

  const fmt = n => {
    const dollars = Math.floor(n);
    const cents = Math.round((n - dollars) * 100).toString().padStart(2, '0');
    return `$${dollars}<sup>${cents}</sup>`;
  };
  const saveEl  = document.querySelector('.ll-save b');
  const totalEl = document.querySelector('.ll-total b');
  if (saveEl)  saveEl.innerHTML  = fmt(save);
  if (totalEl) totalEl.innerHTML = fmt(total);
}

window.llRemove = function(btn) {
  btn.closest('.lcard').remove();
  updateLLSummary();
};

window.llChangeQty = function(btn, d) {
  const card = btn.closest('.lcard');
  const numEl = card.querySelector('.lcard-qty-num');
  const cur = parseInt(card.dataset.qty) || 1;
  const next = cur + d;
  if (next < 1) {
    // Decrementing past 1 → ask before removing
    showLLConfirm(card);
    return;
  }
  card.dataset.qty = next;
  numEl.textContent = next;
  updateLLSummary();
};

/* ─── REMOVE CONFIRMATION DIALOG ─── */
let _llPendingRemove = null;

function showLLConfirm(card) {
  _llPendingRemove = card;
  let modal = document.getElementById('ll-confirm-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'll-confirm-modal';
    modal.className = 'll-confirm-modal';
    modal.innerHTML = `
      <div class="ll-confirm-backdrop"></div>
      <div class="ll-confirm-box" role="dialog" aria-modal="true">
        <div class="ll-confirm-title">Are you sure remove this item?</div>
        <div class="ll-confirm-actions">
          <button class="ll-confirm-no">No</button>
          <button class="ll-confirm-yes">Yes</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.ll-confirm-backdrop').addEventListener('click', closeLLConfirm);
    modal.querySelector('.ll-confirm-no').addEventListener('click', closeLLConfirm);
    modal.querySelector('.ll-confirm-yes').addEventListener('click', confirmLLRemove);
  }
  modal.classList.add('show');
}

function closeLLConfirm() {
  _llPendingRemove = null;
  document.getElementById('ll-confirm-modal')?.classList.remove('show');
}

function confirmLLRemove() {
  if (_llPendingRemove) {
    _llPendingRemove.remove();
    _llPendingRemove = null;
    updateLLSummary();
  }
  document.getElementById('ll-confirm-modal')?.classList.remove('show');
}

window.pcardExpandQty = function(btn) {
  const card = btn.closest('.pcard-h');
  btn.style.display = 'none';
  card.querySelector('.pcard-qty-ctrl').classList.add('show');
  card.querySelector('.pcard-save-bar').classList.remove('hidden');
};

window.pcardCancelQty = function(btn) {
  const card = btn.closest('.pcard-h');
  card.querySelector('.pcard-qty-num').textContent = '1';
  card.querySelector('.pcard-qty-ctrl').classList.remove('show');
  card.querySelector('.pcard-add-btn').style.display = '';
  card.querySelector('.pcard-save-bar').classList.add('hidden');
};

window.pcardSaveQty = function(btn) {
  const card = btn.closest('.pcard-h');
  card.querySelector('.pcard-qty-ctrl').classList.remove('show');
  card.querySelector('.pcard-add-btn').style.display = '';
  card.querySelector('.pcard-save-bar').classList.add('hidden');
};

window.pcardChangeQty = function(btn, d) {
  const ctrl = btn.closest('.pcard-qty-ctrl');
  const el = ctrl.querySelector('.pcard-qty-num');
  const next = parseInt(el.textContent) + d;
  if (next < 1) {
    pcardCancelQty(btn);
    return;
  }
  el.textContent = next;
};
